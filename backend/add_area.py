import pymongo

# Database connection details
MONGO_URI = "mongodb://094510.xyz:8827/"
DATABASE_NAME = "pwasset"

# Area details to add
AREA_DATA = {
    "areaId": "000",
    "code": "000",
    "name": "Test Area"
}

try:
    # Establish connection
    client = pymongo.MongoClient(MONGO_URI)
    db = client[DATABASE_NAME]
    areas_collection = db.areas

    # Check if the area already exists
    if areas_collection.find_one({"code": AREA_DATA["code"]}):
        print(f"Area with code '{AREA_DATA['code']}' already exists. No action taken.")
    else:
        # Insert the new area
        areas_collection.insert_one(AREA_DATA)
        print(f"Successfully inserted area with code '{AREA_DATA['code']}'.")

except Exception as e:
    print(f"An error occurred: {e}")

finally:
    # Close the connection
    if 'client' in locals() and client:
        client.close()