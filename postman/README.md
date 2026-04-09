# Postman Collection

Postman collection for testing the Ministry Platform REST API directly, independent of the n8n node.

## Setup

1. Import `MinistryPlatform-API.postman_collection.json` into Postman
2. Edit the collection variables:
   - `baseUrl` — your MP instance URL + `/ministryplatformapi` (e.g. `https://churchname.ministryplatform.com/ministryplatformapi`)
   - `clientId` — OAuth2 client ID
   - `clientSecret` — OAuth2 client secret
   - `scope` — usually `http://www.thinkministry.com/dataplatform/scopes/all`
3. Run **OAuth2 > Get Access Token** — the test script auto-saves the token
4. All other requests inherit the Bearer token automatically

## Endpoints

### Tables
| Request | Method | Endpoint | Notes |
|---------|--------|----------|-------|
| List All Tables | GET | `/tables` | |
| Query Records | GET | `/tables/{table}` | $select, $filter, $orderby, $top, $skip |
| Query Records (POST) | POST | `/tables/{table}/get` | Body-based params for long queries |
| Get by ID | GET | `/tables/{table}/{id}` | |
| Create | POST | `/tables/{table}` | JSON array body |
| Update | PUT | `/tables/{table}` | JSON array body, must include PK |
| Delete (single) | DELETE | `/tables/{table}/{id}` | |
| Delete (bulk) | POST | `/tables/{table}/delete` | `{ "Ids": [...], "User": n }` |

### Stored Procedures
| Request | Method | Endpoint | Notes |
|---------|--------|----------|-------|
| List | GET | `/procs` | $search with * wildcard |
| Execute | POST | `/procs/{proc}` | JSON parameters body |

### Communications
| Request | Method | Endpoint | Notes |
|---------|--------|----------|-------|
| Send | POST | `/communications` | Email or SMS |

### Files
| Request | Method | Endpoint | Notes |
|---------|--------|----------|-------|
| Get | GET | `/files/{uniqueFileId}` | Binary, optional $thumbnail |

## Filter Syntax

The `$filter` parameter uses SQL WHERE syntax (not OData):

```
Display_Name LIKE '%Smith%'
Contact_ID > 1000
Email_Address IS NOT NULL
Contact_ID IN (1001, 1002, 1003)
Created_Date >= '2024-01-01'
Display_Name = 'O''Brien'          -- escape single quotes by doubling
```

## $select Advanced Syntax

```
Contact_ID, Display_Name                           -- basic columns
Congregation_ID_Table.Congregation_Name            -- FK join
Household_ID_Table_Address_ID_Table.City           -- chained FK join
dp_Created.*, dp_Updated.*                         -- audit log
dp_fileUniqueId                                    -- default image GUID
SUM(Donation_Amount) AS Total                      -- aggregate (with $groupby)
```
