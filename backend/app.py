from flask import Flask, request, jsonify
from flask_cors import CORS
import pymongo
import hashlib
import jwt
import datetime
import os
from functools import wraps
from bson import ObjectId

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration via environment variables (with sensible defaults)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-here')
MONGO_URI = os.environ.get('MONGO_URI', "mongodb://094510.xyz:8827/")
DATABASE_NAME = os.environ.get('DATABASE_NAME', "pwasset")

# Database connection
client = pymongo.MongoClient(MONGO_URI)
db = client[DATABASE_NAME]
users_collection = db.users
areas_collection = db.areas
parks_collection = db.parks
asset_list_collection = db.asset_list
transfer_list_collection = db.transfer_list
disposal_list_collection = db.disposal_list
logs_collection = db.logs

# MD5 encryption function
def md5_encrypt(password):
    return hashlib.md5(password.encode()).hexdigest()

# JWT token decorator
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
        
        try:
            if token.startswith('Bearer '):
                token = token[7:]
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            current_user = users_collection.find_one({'userId': data['userId']})
        except:
            return jsonify({'message': 'Token is invalid!'}), 401
        
        return f(current_user, *args, **kwargs)
    return decorated

# Login endpoint
@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        userId = data.get('userId')
        password = data.get('password')
        remember7Days = bool(data.get('remember7Days'))
        
        if not userId or not password:
            return jsonify({'message': 'UserId and password are required!'}), 400
        
        # Find user in database
        user = users_collection.find_one({'userId': userId})
        
        if not user:
            return jsonify({'message': 'Invalid credentials!'}), 401
        
        # Verify password
        if user['password'] != md5_encrypt(password):
            return jsonify({'message': 'Invalid credentials!'}), 401
        
        # Generate JWT token with duration based on remember option
        exp_delta = datetime.timedelta(days=7) if remember7Days else datetime.timedelta(hours=24)
        token = jwt.encode({
            'userId': user['userId'],
            'exp': datetime.datetime.utcnow() + exp_delta
        }, app.config['SECRET_KEY'], algorithm='HS256')
        
        return jsonify({
            'message': 'Login successful!',
            'token': token,
            'user': {
                'userId': user['userId'],
                'userName': user['userName'],
                'userGroup': user['userGroup'],
                'parkIds': user['parkIds']
            }
        }), 200
        
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500

# Get user profile endpoint
@app.route('/api/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    return jsonify({
        'user': {
            'userId': current_user['userId'],
            'userName': current_user['userName'],
            'userGroup': current_user['userGroup'],
            'parkIds': current_user['parkIds'],
            'parks': list(parks_collection.find({'parkId': {'$in': current_user['parkIds']}}, {'_id': 0}))
        }
    }), 200

# Health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'message': 'Backend server is running!'}), 200

# Get all areas
@app.route('/api/areas', methods=['GET'])
@token_required
def get_areas(current_user):
    areas = list(areas_collection.find({}, {'_id': 0}))
    return jsonify(areas)

# Get all parks
@app.route('/api/parks', methods=['GET'])
@token_required
def get_parks(current_user):
    parks = list(parks_collection.find({}, {'_id': 0}))
    return jsonify(parks)

# Get assets by location
@app.route('/api/assets', methods=['GET'])
@token_required
def get_assets(current_user):
    locations_str = request.args.get('locations')
    
    query = {}
    if locations_str and locations_str.upper() != 'ALL':
        locations_list = locations_str.split(',')
        query['Location'] = {'$in': locations_list}
        
    try:
        # Exclude _id and convert ISODate to string for JSON serialization
        assets = asset_list_collection.find(query).sort('When', pymongo.DESCENDING)
        
        # Manual serialization to handle datetime
        result = []
        for asset in assets:
            if 'When' in asset and isinstance(asset['When'], datetime.datetime):
                asset['When'] = asset['When'].isoformat()
            # Convert _id to string for frontend actions
            if '_id' in asset:
                asset['_id'] = str(asset['_id'])
            result.append(asset)
            
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500


# Add new asset
@app.route('/api/assets/add', methods=['POST'])
@token_required
def add_asset(current_user):
    try:
        data = request.get_json() or {}

        location = data.get('Location')
        old_asset_code = data.get('Old Asset Code')
        sn = data.get('SN')
        details = data.get('Details')

        if not location or not details:
            return jsonify({'message': 'Location and Details are required!'}), 400

        # Lookup area code from parks by location (parkId)
        park = parks_collection.find_one({'parkId': location})
        area_code = park.get('areaCode') if park else ''

        # Use GMT+8 time for registration
        when_dt = datetime.datetime.utcnow() + datetime.timedelta(hours=8)

        doc = {
            'When': when_dt,
            'Old Asset Code': old_asset_code or '',
            'SN': sn or '',
            'operator': current_user.get('userName', ''),
            'Details': details,
            'Tag': 'onsite',
            '_syncOrigin': 'A',
            'Location': location,
            'Area Code': area_code
        }

        result = asset_list_collection.insert_one(doc)

        # Prepare output with ISO string for When
        output = {**doc, '_id': str(result.inserted_id)}
        if isinstance(output['When'], datetime.datetime):
            output['When'] = output['When'].isoformat()

        # Write log: add
        try:
            logs_collection.insert_one({
                'Action': 'add',
                'operator': current_user.get('userName', ''),
                'Before': {},
                'After': {k: v for k, v in output.items() if k != '_id'},
                'time': (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S'),
                'targetType': 'asset',
                'targetId': output.get('_id')
            })
        except Exception:
            pass
        return jsonify({'message': 'Asset added successfully', 'item': output}), 201
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500


# Get transfer history by assetId
@app.route('/api/transfers', methods=['GET'])
@token_required
def get_transfers(current_user):
    locations_str = request.args.get('locations')
    
    query = {}
    if locations_str and locations_str.upper() != 'ALL':
        locations_list = locations_str.split(',')
        query['Location'] = {'$in': locations_list}
        
    try:
        transfers = transfer_list_collection.find(query, {'_id': 0}).sort('When', pymongo.DESCENDING)
        
        result = []
        for transfer in transfers:
            if 'When' in transfer and isinstance(transfer['When'], datetime.datetime):
                transfer['When'] = transfer['When'].isoformat()
            result.append(transfer)
            
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500

# Add new transfer record
@app.route('/api/transfers/add', methods=['POST'])
@token_required
def add_transfer(current_user):
    try:
        data = request.get_json() or {}

        old_asset_code = data.get('Old Asset Code')
        by = data.get('By') or ''
        to_location = data.get('To')
        reason = data.get('Reason') or 'Operation'
        when_date = data.get('whenDate')  # 'YYYY-MM-DD'

        if not old_asset_code or not to_location:
            return jsonify({'message': 'Old Asset Code and To are required!'}), 400

        # Determine When (GMT+8)
        if when_date:
            try:
                base_dt = datetime.datetime.strptime(when_date, '%Y-%m-%d')
                when_dt = base_dt + datetime.timedelta(hours=8)
            except Exception:
                when_dt = datetime.datetime.utcnow() + datetime.timedelta(hours=8)
        else:
            when_dt = datetime.datetime.utcnow() + datetime.timedelta(hours=8)

        doc = {
            'Old Asset Code': old_asset_code,
            'By': by,
            'To': to_location,
            'Reason': reason,
            'When': when_dt,
            'operator': current_user.get('userName', ''),
            # For location-based filtering, store target park in Location
            'Location': to_location
        }

        result = transfer_list_collection.insert_one(doc)

        # Update corresponding asset's Location and When
        try:
            before_asset = asset_list_collection.find_one({'Old Asset Code': old_asset_code})
            if before_asset:
                asset_list_collection.update_one(
                    {'_id': before_asset['_id']},
                    {'$set': {
                        'Location': to_location,
                        'When': when_dt,
                        'operator': current_user.get('userName', '')
                    }}
                )
        except Exception:
            # Non-blocking if asset not found or update fails
            pass

        # Prepare output
        output = {**doc, '_id': str(result.inserted_id)}
        if isinstance(output['When'], datetime.datetime):
            output['When'] = output['When'].isoformat()

        # Write log: add transfer
        try:
            logs_collection.insert_one({
                'Action': 'add',
                'operator': current_user.get('userName', ''),
                'Before': {},
                'After': {k: v for k, v in output.items() if k != '_id'},
                'time': (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S'),
                'targetType': 'transfer',
                'targetId': output.get('_id')
            })
        except Exception:
            pass
        return jsonify({'message': 'Transfer added successfully', 'item': output}), 201
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500

# Update transfer record
@app.route('/api/transfers/update', methods=['POST'])
@token_required
def update_transfer(current_user):
    try:
        data = request.get_json() or {}
        item_id = data.get('id')
        after = data.get('After') or {}
        if not item_id:
            return jsonify({'message': 'id is required'}), 400
        before_doc = transfer_list_collection.find_one({'_id': ObjectId(item_id)})
        if not before_doc:
            return jsonify({'message': 'Transfer not found'}), 404

        # Normalize When if provided as date string
        if 'When' in after and isinstance(after['When'], str):
            try:
                base_dt = datetime.datetime.strptime(after['When'], '%Y-%m-%d')
                after['When'] = base_dt + datetime.timedelta(hours=8)
            except Exception:
                after['When'] = datetime.datetime.utcnow() + datetime.timedelta(hours=8)

        after['operator'] = current_user.get('userName', '')

        transfer_list_collection.update_one({'_id': ObjectId(item_id)}, {'$set': after})
        updated = transfer_list_collection.find_one({'_id': ObjectId(item_id)})

        # If To/When changed, reflect in asset_list
        try:
            target_code = updated.get('Old Asset Code')
            to_location = updated.get('To')
            when_dt = updated.get('When')
            if target_code and to_location:
                asset_list_collection.update_one(
                    {'Old Asset Code': target_code},
                    {'$set': {
                        'Location': to_location,
                        'When': when_dt if isinstance(when_dt, datetime.datetime) else datetime.datetime.utcnow() + datetime.timedelta(hours=8),
                        'operator': current_user.get('userName', '')
                    }}
                )
        except Exception:
            pass

        # Serialize for response
        def clean(doc):
            c = {k: v for k, v in doc.items() if k != '_id'}
            if 'When' in c and isinstance(c['When'], datetime.datetime):
                c['When'] = c['When'].isoformat()
            return c
        logs_collection.insert_one({
            'Action': 'update',
            'operator': current_user.get('userName', ''),
            'Before': clean(before_doc),
            'After': clean(updated),
            'time': (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S'),
            'targetType': 'transfer',
            'targetId': item_id
        })
        return jsonify({'message': 'Transfer updated successfully', 'item': {**clean(updated), '_id': str(updated['_id'])}}), 200
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500

# Delete transfer record
@app.route('/api/transfers/delete', methods=['POST'])
@token_required
def delete_transfer(current_user):
    try:
        data = request.get_json() or {}
        item_id = data.get('id')
        if not item_id:
            return jsonify({'message': 'id is required'}), 400
        before_doc = transfer_list_collection.find_one({'_id': ObjectId(item_id)})
        if not before_doc:
            return jsonify({'message': 'Transfer not found'}), 404
        transfer_list_collection.delete_one({'_id': ObjectId(item_id)})
        def clean(doc):
            c = {k: v for k, v in doc.items() if k != '_id'}
            if 'When' in c and isinstance(c['When'], datetime.datetime):
                c['When'] = c['When'].isoformat()
            return c
        logs_collection.insert_one({
            'Action': 'delete',
            'operator': current_user.get('userName', ''),
            'Before': clean(before_doc),
            'After': {},
            'time': (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S'),
            'targetType': 'transfer',
            'targetId': item_id
        })
        return jsonify({'message': 'Transfer deleted successfully'}), 200
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500

# Get disposal history by assetId
@app.route('/api/disposals', methods=['GET'])
@token_required
def get_disposals(current_user):
    locations_str = request.args.get('locations')
    
    query = {}
    if locations_str and locations_str.upper() != 'ALL':
        locations_list = locations_str.split(',')
        query['Location'] = {'$in': locations_list}
        
    try:
        disposals = disposal_list_collection.find(query).sort('When', pymongo.DESCENDING)
        
        result = []
        for disposal in disposals:
            if 'When' in disposal and isinstance(disposal['When'], datetime.datetime):
                disposal['When'] = disposal['When'].isoformat()
            if '_id' in disposal:
                disposal['_id'] = str(disposal['_id'])
            result.append(disposal)
            
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500

# Add new disposal record
@app.route('/api/disposals/add', methods=['POST'])
@token_required
def add_disposal(current_user):
    try:
        data = request.get_json() or {}

        location = data.get('Location')
        old_asset_code = data.get('Old Asset Code')
        sn = data.get('SN')
        details = data.get('Details')
        reason_base = data.get('reasonBase')  # 'Scrapped' | 'Sold to Third Party' | 'Trade in'
        vendor = data.get('Vendor') or ''
        when_date = data.get('whenDate')  # 'YYYY-MM-DD'

        if not location or not old_asset_code or not reason_base:
            return jsonify({'message': 'Location, Old Asset Code, and reason are required!'}), 400

        if reason_base in ['Sold to Third Party', 'Trade in'] and not vendor:
            return jsonify({'message': 'Vendor is required for selected reason!'}), 400

        if reason_base == 'Sold to Third Party':
            reason = f"Sold To {vendor}"
        elif reason_base == 'Trade in':
            reason = f"Trade in to {vendor}"
        else:
            reason = 'Scrapped'

        # Determine When (GMT+8)
        if when_date:
            try:
                base_dt = datetime.datetime.strptime(when_date, '%Y-%m-%d')
                when_dt = base_dt + datetime.timedelta(hours=8)
            except Exception:
                when_dt = datetime.datetime.utcnow() + datetime.timedelta(hours=8)
        else:
            when_dt = datetime.datetime.utcnow() + datetime.timedelta(hours=8)

        doc = {
            'Location': location,
            'Old Asset Code': old_asset_code,
            'SN': sn or '',
            'Details': details or '',
            'Reason': reason,
            'When': when_dt,
            'operator': current_user.get('userName', '')
        }

        result = disposal_list_collection.insert_one(doc)

        # Prepare output with ISO string for When
        output = {**doc, '_id': str(result.inserted_id)}
        if isinstance(output['When'], datetime.datetime):
            output['When'] = output['When'].isoformat()

        # Write log: add
        try:
            logs_collection.insert_one({
                'Action': 'add',
                'operator': current_user.get('userName', ''),
                'Before': {},
                'After': {k: v for k, v in output.items() if k != '_id'},
                'time': (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S'),
                'targetType': 'disposal',
                'targetId': output.get('_id')
            })
        except Exception:
            pass
        return jsonify({'message': 'Disposal added successfully', 'item': output}), 201
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500

# Update asset
@app.route('/api/assets/update', methods=['POST'])
@token_required
def update_asset(current_user):
    try:
        data = request.get_json() or {}
        item_id = data.get('id')
        after = data.get('After') or {}
        if not item_id:
            return jsonify({'message': 'id is required'}), 400
        before_doc = asset_list_collection.find_one({'_id': ObjectId(item_id)})
        if not before_doc:
            return jsonify({'message': 'Asset not found'}), 404
        # Do not allow editing Tag via this endpoint; operator always set to current user
        after.pop('Tag', None)
        # Ensure legacy field is not reintroduced
        after.pop('New Asset Code', None)
        after['operator'] = current_user.get('userName', '')
        # Update document
        asset_list_collection.update_one({'_id': ObjectId(item_id)}, {'$set': after})
        updated = asset_list_collection.find_one({'_id': ObjectId(item_id)})
        # Serialize datetime and _id
        def clean(doc):
            c = {k: v for k, v in doc.items() if k != '_id'}
            if 'When' in c and isinstance(c['When'], datetime.datetime):
                c['When'] = c['When'].isoformat()
            return c
        logs_collection.insert_one({
            'Action': 'edit',
            'operator': current_user.get('userName', ''),
            'Before': clean(before_doc),
            'After': clean(updated),
            'time': (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S'),
            'targetType': 'asset',
            'targetId': item_id
        })
        updated['_id'] = str(updated['_id'])
        if 'When' in updated and isinstance(updated['When'], datetime.datetime):
            updated['When'] = updated['When'].isoformat()
        return jsonify({'message': 'Asset updated successfully', 'item': updated}), 200
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500

# Delete asset
@app.route('/api/assets/delete', methods=['POST'])
@token_required
def delete_asset(current_user):
    try:
        data = request.get_json() or {}
        item_id = data.get('id')
        if not item_id:
            return jsonify({'message': 'id is required'}), 400
        before_doc = asset_list_collection.find_one({'_id': ObjectId(item_id)})
        if not before_doc:
            return jsonify({'message': 'Asset not found'}), 404
        asset_list_collection.delete_one({'_id': ObjectId(item_id)})
        def clean(doc):
            c = {k: v for k, v in doc.items() if k != '_id'}
            if 'When' in c and isinstance(c['When'], datetime.datetime):
                c['When'] = c['When'].isoformat()
            return c
        logs_collection.insert_one({
            'Action': 'delete',
            'operator': current_user.get('userName', ''),
            'Before': clean(before_doc),
            'After': {},
            'time': (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S'),
            'targetType': 'asset',
            'targetId': item_id
        })
        return jsonify({'message': 'Asset deleted successfully'}), 200
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500

# Update disposal
@app.route('/api/disposals/update', methods=['POST'])
@token_required
def update_disposal(current_user):
    try:
        data = request.get_json() or {}
        item_id = data.get('id')
        after = data.get('After') or {}
        if not item_id:
            return jsonify({'message': 'id is required'}), 400
        before_doc = disposal_list_collection.find_one({'_id': ObjectId(item_id)})
        if not before_doc:
            return jsonify({'message': 'Disposal not found'}), 404
        after['operator'] = current_user.get('userName', '')
        disposal_list_collection.update_one({'_id': ObjectId(item_id)}, {'$set': after})
        updated = disposal_list_collection.find_one({'_id': ObjectId(item_id)})
        def clean(doc):
            c = {k: v for k, v in doc.items() if k != '_id'}
            if 'When' in c and isinstance(c['When'], datetime.datetime):
                c['When'] = c['When'].isoformat()
            return c
        logs_collection.insert_one({
            'Action': 'edit',
            'operator': current_user.get('userName', ''),
            'Before': clean(before_doc),
            'After': clean(updated),
            'time': (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S'),
            'targetType': 'disposal',
            'targetId': item_id
        })
        updated['_id'] = str(updated['_id'])
        if 'When' in updated and isinstance(updated['When'], datetime.datetime):
            updated['When'] = updated['When'].isoformat()
        return jsonify({'message': 'Disposal updated successfully', 'item': updated}), 200
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500

# Delete disposal
@app.route('/api/disposals/delete', methods=['POST'])
@token_required
def delete_disposal(current_user):
    try:
        data = request.get_json() or {}
        item_id = data.get('id')
        if not item_id:
            return jsonify({'message': 'id is required'}), 400
        before_doc = disposal_list_collection.find_one({'_id': ObjectId(item_id)})
        if not before_doc:
            return jsonify({'message': 'Disposal not found'}), 404
        disposal_list_collection.delete_one({'_id': ObjectId(item_id)})
        def clean(doc):
            c = {k: v for k, v in doc.items() if k != '_id'}
            if 'When' in c and isinstance(c['When'], datetime.datetime):
                c['When'] = c['When'].isoformat()
            return c
        logs_collection.insert_one({
            'Action': 'delete',
            'operator': current_user.get('userName', ''),
            'Before': clean(before_doc),
            'After': {},
            'time': (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S'),
            'targetType': 'disposal',
            'targetId': item_id
        })
        return jsonify({'message': 'Disposal deleted successfully'}), 200
    except Exception as e:
        return jsonify({'message': f'Error: {str(e)}'}), 500

if __name__ == '__main__':
    # Allow overriding port via environment; default to 5174 per deployment plan
    port = int(os.environ.get('PORT', 5174))
    print(f"Starting backend server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)