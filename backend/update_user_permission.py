import pymongo

# Database connection details (same as in app.py)
MONGO_URI = "mongodb://094510.xyz:8827/"
DATABASE_NAME = "pwasset"
USER_ID_TO_UPDATE = "wuchunkei"
PARK_IDS_TO_ADD = ["NP360", "TEST"]  # Add both park IDs

try:
    # Establish connection
    client = pymongo.MongoClient(MONGO_URI)
    db = client[DATABASE_NAME]
    users_collection = db.users

    # Find the user and update the parkIds array
    result = users_collection.update_one(
        { "userId": USER_ID_TO_UPDATE },
        { "$addToSet": { "parkIds": { "$each": PARK_IDS_TO_ADD } } }  # Use $each to add multiple values
    )

    if result.matched_count > 0:
        if result.modified_count > 0:
            print(f"Successfully updated parkIds for user '{USER_ID_TO_UPDATE}'.")
        else:
            print(f"All specified parkIds already exist for user '{USER_ID_TO_UPDATE}'. No update needed.")
    else:
        print(f"User '{USER_ID_TO_UPDATE}' not found.")

except Exception as e:
    print(f"An error occurred: {e}")

finally:
    # Close the connection
    if 'client' in locals() and client:
        client.close()