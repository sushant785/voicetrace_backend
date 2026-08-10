# VoiceTrace Backend — System Overview

## 1. What is VoiceTrace?

VoiceTrace is a backend system for managing and analyzing **vendor business activity** such as sales, expenses, credit transactions (`Udhar`), daily business summaries, and business insights.

From the Node.js code, the system is designed around a `Vendor` and their day-to-day business transactions. The backend stores individual business events and converts them into aggregated daily records that can be consumed by dashboard, ledger, reporting, and insight-oriented features.

The code also contains support for **audio recordings**. Sales, expenses, and Udhar events can store a `voiceUrl` and `transcript`, which indicates that voice-originated business entries are part of the overall system. However, the actual speech-to-text or AI processing that converts audio into structured events is **not present in this Node.js codebase**.

The backend therefore acts primarily as the **business-data and API layer** between the client applications, MongoDB, S3-compatible object storage, and an external Python backend.

---

## 2. What problem does it solve?

The system is designed to help a vendor maintain structured records of everyday business activity.

The important business entities visible in the backend are:

- **Sales** — what items were sold, how many, their price, and total amount.
- **Expenses** — business expenses and their categories.
- **Udhar** — money given or received on credit, associated with a person.
- **Daily records** — an aggregated view of a vendor's activity for a particular day.
- **Insights** — longer-term business statistics such as average income, best days, best items, waste percentage, and pending Udhar.
- **Recommendations** — recommendation data retrieved for the vendor's dashboard.
- **Voice recordings** — `.m4a` audio files stored in S3-compatible storage.
- **Reports** — weekly income statements generated as PDF files.

The important architectural idea is that the system separates **raw business events** from **aggregated daily information**.

For example:

```text
Individual Sales
Individual Expenses
Individual Udhar Transactions
          |
          v
   Daily Aggregation
          |
          v
      DailyRecord
          |
          +---- Dashboard
          +---- Ledger
          +---- PDF Report
```

This allows individual events to remain available while the system also maintains a convenient daily summary.

---

# 3. Main Business Concepts

## 3.1 Sales

Sales are represented by the `SaleEvent` model.

A sale contains information such as:

- vendor
- timestamp/date
- item
- quantity
- price per unit
- total amount
- transcript
- voice recording URL
- confidence
- flags such as:
  - `approximation_used`
  - `missing_quantity`
  - `ambiguous_item`

A sale therefore represents an individual business transaction.

During daily aggregation, sales are grouped by item and used to calculate:

- total income
- quantity sold per item
- total sales per item
- average selling price per unit

The aggregation happens inside `updateDailyRecord()`.

---

## 3.2 Expenses

Expenses are represented by `ExpenseEvent`.

An expense contains:

- vendor
- date/timestamp
- amount
- expense type
- note
- voice URL
- transcript
- confidence
- correction information
- interpretation flags

The daily service calculates the total expense and also groups expenses by category.

For example:

```text
Gas       → ₹500
Raw Material → ₹1,000
Other     → ₹200

Total Expense = ₹1,700
```

The exact categories depend on the event data stored.

---

## 3.3 Udhar

`UdharEvent` represents credit transactions.

The system distinguishes between:

```text
given
received
```

For example:

```text
Vendor gives ₹500 on credit to Rahul
→ type = "given"

Vendor receives ₹300 previously owed by Rahul
→ type = "received"
```

The Udhar summary groups transactions by person and calculates:

```text
Pending Amount =
Total Given - Total Received
```

It also sorts people by pending amount so that the largest outstanding amounts appear first.

The `Insights` model also contains `totalUdharPending` and `frequentBorrowers`, showing that credit information is part of the longer-term business picture.

---

## 3.4 Daily Records

`DailyRecord` is the central aggregated business record.

It contains information such as:

```text
itemsSold
expenses
unsoldItems
wastedItems
udharSummary
calculatedIncome
totalExpense
profit
totalTransactions
activeHours
suggestions
```

The important distinction is:

> `SaleEvent`, `ExpenseEvent`, and `UdharEvent` represent individual events, while `DailyRecord` represents an aggregated view of those events for a day.

The `updateDailyRecord()` service retrieves the three event types for a date, aggregates them, calculates income/expenses/profit, and updates the corresponding `DailyRecord`. 
---

## 3.5 Insights

The `Insights` model stores longer-term business-level information.

It contains fields for:

- best days
- best time of day
- best-selling items
- worst items
- average daily income
- average daily expense
- average profit
- waste percentage
- total pending Udhar
- frequent borrowers
- anomalies
- suggestions



However, the Node.js code provided does **not show the process that calculates these insights**.

The Node backend can retrieve them and return them to the frontend, but the actual generation/update logic is not present in this codebase.

---

## 3.6 Recommendations

The home dashboard retrieves recommendation documents from a MongoDB collection named `recommendations`.

The dashboard queries recommendations using the vendor's MongoDB `ObjectId` and sorts them by date.

The exact algorithm that generates these recommendations is **not shown**.

Therefore:

### Currently visible from code

The Node backend:

- retrieves recommendations
- associates them with a vendor
- returns them as part of dashboard data

### Not shown

The code does not establish:

- how recommendations are generated
- whether AI is used
- whether Python generates them
- what algorithm determines them

Those details require the corresponding code that is not included in `CODEBASE.md`.

---

## 3.7 Voice Recordings

The backend provides an `/api/recordings` router for `.m4a` audio files.

The upload flow is:

```text
Audio file
    |
    v
Multer memory storage
    |
    v
Validation
(.m4a / supported MIME type)
    |
    v
S3-compatible storage
    |
    v
Presigned GET URL
    |
    v
Client
```

Multer stores the uploaded file in memory and limits the file size to **25 MB**. Only `.m4a` files or the allowed MIME types are accepted.

The file is then uploaded using the AWS SDK's S3 client.

The backend returns a presigned URL that is valid for one hour.

The event models can also store:

```text
voiceUrl
transcript
confidence
flags
```

This shows that voice data can be associated with structured business events.

However, **the Node code does not perform speech recognition**.

---

## 3.8 Reports

The backend can generate a weekly income statement as a PDF.

The endpoint collects `DailyRecord` documents for a requested week and calculates:

- total income
- total expense
- total profit/loss
- total transactions
- active days
- Udhar given
- Udhar received
- estimated wastage loss
- top sold items
- expense breakdown

It then generates an A4 PDF using PDFKit and streams it directly through the HTTP response.

The report explicitly describes itself as an informal income statement rather than an audited financial statement.

---

# 4. Backend Architecture

At a high level, the system can be understood as:

```text
                    FRONTEND
                       |
                       | HTTP / JSON
                       v
              +-------------------+
              | Node.js / Express |
              |    Backend        |
              +-------------------+
                 |       |      |
                 |       |      |
                 v       v      v
             MongoDB     S3    Python
                         |      Backend
                         |
                    Audio Files
```

A more detailed conceptual view is:

```text
                         Frontend
                            |
                            | REST API
                            v
                 +----------------------+
                 |   Node.js / Express  |
                 |                      |
                 | Routes               |
                 | Controllers          |
                 | Services             |
                 | Business aggregation |
                 +----------------------+
                    |       |       |
                    |       |       |
                    v       v       v
                MongoDB    S3     Python
                           /       Backend
                      Audio
                     Storage
```

## Frontend

The frontend is the client consuming the Node API.

The exact frontend implementation is **not included**, so the Node code only lets us establish that clients interact with routes such as:

```text
/api/home
/api/daily-records
/api/ledger
/api/udhar
/api/recordings
/api/internal
```

The CORS configuration specifically allows:

```text
http://localhost:5173
```

which indicates a development frontend running on that origin.

---

## Node.js / Express

Node.js provides the runtime for the backend.

Express provides the HTTP server/application framework.

The Node backend is responsible for:

- exposing REST endpoints
- receiving and validating requests
- interacting with MongoDB
- managing business-event aggregation
- serving dashboard/ledger data
- handling audio uploads
- generating PDF reports
- communicating with the external Python backend through internal endpoints

The main Express application registers the routers and exposes `/health`.

---

## MongoDB

MongoDB is the primary persistent database.

The backend connects to MongoDB using the MongoDB URI from the environment:

```text
MONGO_URI
```



The database stores business entities such as:

```text
Vendor
SaleEvent
ExpenseEvent
UdharEvent
DailyRecord
Insights
```

The code also accesses the `recommendations` collection directly using the native MongoDB database handle.

---

## S3-Compatible Storage

The backend uses the AWS SDK's `S3Client`.

The configuration supports:

- AWS region
- access key
- secret key
- optional custom endpoint
- optional path-style addressing

The optional endpoint means the implementation can work with an S3-compatible storage service rather than necessarily being restricted to AWS S3 itself.

Its main responsibility is storing audio recordings rather than placing binary audio data directly inside MongoDB.

---

## Python Backend

The Node backend exposes:

```text
POST /api/internal/update-daily
POST /api/internal/expense
```

The code comments explicitly identify the internal route as being called by the Python backend.

For example:

```text
Python Backend
      |
      | POST /api/internal/update-daily
      | { vendorId, date }
      v
Node.js
      |
      v
updateDailyRecord()
      |
      v
MongoDB
```

### Currently visible from code

We can establish that:

1. A Python backend exists or is expected to exist.
2. It communicates with the Node backend through HTTP.
3. It can trigger daily-record updates.
4. It can call the expense endpoint.
5. Node remains responsible for updating MongoDB through its own business logic.

### Not shown / needs Python code to confirm

The provided code does **not** show:

- the Python framework
- Python's internal architecture
- speech-to-text implementation
- AI/LLM implementation
- how Python receives audio
- how Python determines a sale/expense/Udhar event
- how Python generates insights
- how Python generates recommendations
- why the project originally chose Python
- whether Python performs ML processing

Those claims should not be made in an interview unless supported by the Python code.

---

# 5. Technologies Used

## Node.js

### What is it?

Node.js is the JavaScript runtime used to execute the backend outside the browser.

### Why does this project use it?

The backend is implemented in JavaScript using Node.js and uses its asynchronous I/O model for operations such as database access, HTTP requests, and S3 operations.

### Responsibility

Node.js provides the runtime for:

- Express
- MongoDB/Mongoose operations
- S3 communication
- PDF generation
- API handling

### Interview concept

**Event-driven, non-blocking I/O.**

Node.js is well suited to API workloads involving many I/O operations because asynchronous operations do not need to block the main execution thread while waiting for external systems.

---

# Express.js

### What is it?

Express.js is a web framework for Node.js.

### Why does this project use it?

It provides routing and HTTP request/response handling.

### Responsibility

Express handles:

```text
HTTP Request
     |
     v
Route
     |
     v
Controller / Handler
     |
     v
HTTP Response
```

The application mounts separate routers for different domains such as recordings, home, daily records, ledger, and Udhar.

### Interview concept

**Middleware and routing.**

Express applications can compose middleware and route handlers to organize HTTP request processing.

---

# MongoDB

### What is it?

MongoDB is a document-oriented NoSQL database.

### Why does this project use it?

The backend stores different types of business records as documents, and several models contain nested arrays and objects.

For example, a `DailyRecord` contains arrays of:

```text
itemsSold
expenses
unsoldItems
wastedItems
suggestions
```



### Responsibility

MongoDB provides persistent storage for the business data.

### Interview concept

**Document-oriented data modeling.**

Instead of requiring every nested business structure to be represented as separate relational tables, MongoDB can store related information inside documents.

---

# Mongoose

### What is it?

Mongoose is an ODM — Object Data Modeling library — for MongoDB and Node.js.

### Why does this project use it?

The project defines schemas and models for business entities.

Examples include:

```text
SaleEvent
ExpenseEvent
UdharEvent
DailyRecord
Vendor
Insights
```

### Responsibility

Mongoose provides:

- schemas
- model definitions
- MongoDB queries
- type definitions
- enum constraints
- ObjectId references

For example, `UdharEvent.type` is restricted to:

```text
given
received
```



### Interview concept

**ODM vs ORM.**

Mongoose plays a role similar to an ORM but for a document database: it maps JavaScript application structures to MongoDB documents and provides schema/model abstractions.

---

# AWS SDK / S3

### What is it?

The AWS SDK provides programmatic access to AWS services. Here it is used through the S3 client.

### Why does this project use it?

Audio recordings are binary files and are better suited to object storage than being embedded directly into MongoDB documents.

### Responsibility

The S3 integration:

- uploads `.m4a` files
- lists recordings
- generates presigned download URLs

The backend uses `PutObjectCommand`, `ListObjectsV2Command`, and `GetObjectCommand`.

### Interview concept

**Presigned URLs.**

A presigned URL gives temporary access to an object without exposing the storage credentials to the client.

In this implementation, generated URLs expire after one hour.

---

# Multer

### What is it?

Multer is Express middleware for handling `multipart/form-data`, especially file uploads.

### Why does this project use it?

The recordings API receives audio files from clients.

### Responsibility

Multer:

- reads the uploaded file
- stores it temporarily in memory
- applies a 25 MB size limit
- filters files to `.m4a` audio



### Interview concept

**Multipart/form-data.**

Unlike a normal JSON request, file uploads use multipart form data so binary files and other form fields can be transmitted together.

---

# PDFKit

### What is it?

PDFKit is a Node.js library for generating PDF documents.

### Why does this project use it?

The backend generates a weekly income statement directly from `DailyRecord` data.

### Responsibility

PDFKit:

- creates the PDF document
- writes headings and values
- formats the weekly summary
- writes the report to the HTTP response



### Interview concept

**Streaming output.**

The code pipes the PDF document directly to the HTTP response:

```text
PDFKit
   |
   v
HTTP Response
```

rather than first requiring a permanent PDF file to be stored on disk.

---

# dotenv

### What is it?

`dotenv` loads environment variables from environment configuration.

### Why does this project use it?

The server imports:

```js
import 'dotenv/config';
```

and uses environment variables for configuration such as:

```text
PORT
MONGO_URI
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET
AWS_S3_ENDPOINT
```

The server initializes dotenv before importing/starting the application.

### Interview concept

**Configuration vs code.**

Environment-specific values such as database credentials and cloud credentials should not be hardcoded directly into application source code.

---

# CORS

### What is it?

CORS — Cross-Origin Resource Sharing — is a browser security mechanism controlling which origins can make cross-origin requests.

### Why does this project use it?

The backend explicitly enables the development frontend:

```text
http://localhost:5173
```



### Responsibility

It allows the browser-based frontend to communicate with the Node backend when they are running on different origins.

### Interview concept

**Origin.**

An origin is determined by scheme, host, and port. Therefore:

```text
localhost:5173
```

and

```text
localhost:5000
```

are different origins even though the hostname is the same.

---

# 6. Core Data Flow

The most important business flow in the backend is:

```text
SaleEvent
ExpenseEvent
UdharEvent
     |
     v
updateDailyRecord()
     |
     v
DailyRecord
     |
     +----------------+
     |                |
     v                v
 Dashboard          Ledger
     |
     +--------+
     |        |
     v        v
 Insights   Reports
```

Conceptually:

### Step 1 — Individual events are recorded

The system stores business activity as individual event documents.

```text
SaleEvent
ExpenseEvent
UdharEvent
```

Each event is associated with a vendor and a date/timestamp.

---

### Step 2 — Daily aggregation runs

`updateDailyRecord(vendorId, date)` retrieves all three event types for that vendor and date.

---

### Step 3 — Sales are aggregated

Sales are grouped by item.

For each item, the system calculates:

```text
quantity
total sales
average price per unit
```

It also calculates:

```text
total income
```



---

### Step 4 — Expenses are aggregated

Expenses are summed and grouped by category.

```text
Total Expense
+
Expense Breakdown
```

are stored in the daily record.

---

### Step 5 — Udhar is aggregated

The system calculates:

```text
givenToday
receivedToday
```

for the daily record.

---

### Step 6 — Other daily metrics are calculated

The service calculates:

```text
activeHours
totalTransactions
profit
```

Profit is currently calculated as:

```text
profit = totalIncome - totalExpense
```



---

### Step 7 — DailyRecord is upserted

The service uses `findOneAndUpdate()` with:

```text
upsert: true
```

This means it updates the existing daily record if one exists, or creates one if it doesn't.

---

# 7. How the DailyRecord is Used

Once the daily record exists, several features consume it.

## Dashboard

The home controller retrieves the daily record and exposes values such as:

```text
earnings
profit
expenses
inventory summary
waste alert
activities
```

It also retrieves longer-term `Insights` and recommendations.

---

## Ledger

The ledger endpoint retrieves a `DailyRecord` for a requested vendor/date and converts it into a UI-oriented response:

```text
summary
salesItems
expenseItems
tips
```



---

## Reports

The weekly PDF endpoint retrieves multiple `DailyRecord` documents and aggregates them across the requested week.

---

# 8. Realistic Example

Suppose a vendor records:

> "I sold 5 cups of chai for ₹20 each."

The exact mechanism that converts the spoken sentence into a `SaleEvent` is **not shown in the Node code**.

But once the Node backend receives/stores a structured sale event, the visible flow is:

```text
SaleEvent

vendorId: V1
item: chai
quantity: 5
pricePerUnit: ₹20
amount: ₹100
       |
       v
updateDailyRecord(V1, date)
       |
       v
itemsSold:
    chai
    quantity = 5
    total = ₹100
    avgPricePerUnit = ₹20

calculatedIncome = ₹100
```

If the same vendor also has:

```text
ExpenseEvent
₹30 gas
```

then:

```text
totalIncome  = ₹100
totalExpense = ₹30

profit = ₹100 - ₹30
       = ₹70
```

If the vendor also gives ₹50 Udhar to a customer:

```text
UdharEvent
type = given
amount = ₹50
```

then the daily record also contains:

```text
givenToday = ₹50
```

The resulting `DailyRecord` can then be consumed by the dashboard, ledger, and weekly reporting functionality.

---

# 9. Current Implementation vs Missing Information

This distinction is important for interviews.

## Currently visible from code

The Node backend clearly implements:

- Express API routes
- MongoDB persistence
- Mongoose models
- Sale/Expense/Udhar event models
- daily aggregation
- dashboard data retrieval
- ledger retrieval
- Udhar aggregation
- audio upload to S3-compatible storage
- signed audio URLs
- weekly PDF generation
- vendor model
- insights retrieval
- recommendations retrieval
- internal HTTP endpoints intended for Python

---

## Not shown / requires additional code

The provided Node code does not establish:

- the frontend implementation
- the Python backend implementation
- speech-to-text processing
- AI/LLM processing
- audio-to-event extraction
- recommendation-generation algorithm
- insights-generation algorithm
- authentication implementation
- authorization implementation
- deployment architecture
- background job/queue infrastructure
- automated testing
- CI/CD
- production monitoring
- rate limiting

Therefore, these should not be presented as implemented Node backend features without additional code.

---

# 10. Security — Current State

The backend has some basic defensive validation, but the provided code does **not show a complete authentication/authorization layer**.

Examples of visible validation include:

- MongoDB ObjectId validation
- required parameters
- file type validation
- file size limits
- filename sanitization
- environment-based credentials
- temporary S3 URLs

For example, the recordings API limits uploads to 25 MB and only accepts `.m4a` audio.

The API also validates vendor IDs in several endpoints before using them as MongoDB ObjectIds.

However, there is no authentication middleware visible in `app.js`, and the routes shown do not demonstrate JWT/session-based authentication.

Therefore, the accurate interview statement is:

> "The current Node code has input and file validation, but I would not claim that the provided code has a complete authentication and authorization layer."

---

# 11. Important Design Decision: Event Data vs Daily Aggregates

One of the most important design decisions visible in the backend is the separation between:

```text
Event Data
```

and:

```text
Aggregated Daily Data
```

The system keeps individual:

```text
SaleEvent
ExpenseEvent
UdharEvent
```

and derives:

```text
DailyRecord
```

from them.

This is useful because the application can answer two different types of questions.

### Transaction-level questions

```text
What sale happened?
What expense happened?
Who was given Udhar?
```

These are answered using event collections.

### Summary-level questions

```text
How much did I earn today?
How much did I spend?
What was today's profit?
How many transactions happened?
```

These are answered efficiently using `DailyRecord`.

The aggregation logic is centralized in `updateDailyRecord()`, rather than duplicating the same calculations independently in every controller.

---

# 12. Interview Questions and Answers

## 1. Tell me about your project.

### Answer

"VoiceTrace is a backend system for managing day-to-day business activity for vendors. The system handles sales, expenses and Udhar transactions, stores them as individual events, and then aggregates those events into daily records. Those daily records are used by features like the dashboard, ledger and weekly income reports. The backend also supports storing voice recordings in S3-compatible storage, and there are internal APIs for interaction with a Python backend. I built the Node.js and Express side around MongoDB and Mongoose, with PDFKit for reports and the AWS SDK for audio storage."

### Explanation

This answer focuses on what can actually be established from the Node code.

It avoids claiming that Node performs speech recognition or AI processing because that implementation is not present.

---

## 2. What problem does VoiceTrace solve?

### Answer

"It provides a structured way for a vendor to maintain business records such as sales, expenses and credit transactions. Instead of keeping only individual transactions, the backend also aggregates them into daily records, which makes it easier for the application to show income, expenses, profit, transaction counts and other business summaries."

### Explanation

The core visible problem is business-data organization and aggregation.

Voice is clearly part of the system because recordings and transcripts exist, but the actual voice-processing workflow is outside the provided Node code.

---

## 3. What is the role of the Node.js backend?

### Answer

"The Node.js backend acts as the main API and business-data layer. Express exposes the REST endpoints, Mongoose handles the MongoDB models, and the backend performs operations such as storing business events, aggregating daily records, serving dashboard and ledger data, handling audio uploads to S3, and generating weekly PDF reports. It also exposes internal endpoints that the Python backend can call."

### Explanation

This captures the actual responsibilities visible in the routes, controllers, services and configuration.

---

## 4. What technologies did you use?

### Answer

"I used Node.js with Express for the backend API, MongoDB with Mongoose for persistence, the AWS SDK for S3-compatible audio storage, Multer for handling multipart audio uploads, PDFKit for generating weekly reports, dotenv for environment configuration, and CORS for allowing the development frontend to communicate with the backend."

### Explanation

This is a concise stack explanation while connecting each technology to a real responsibility.

---

## 5. Why did you choose Node.js?

### Answer

"Node.js works well for this type of backend because a lot of the work involves I/O operations such as database queries, S3 operations and HTTP requests. Its asynchronous programming model makes it a natural fit for an API server handling these operations. It also allowed the API layer to be written in JavaScript."

### Explanation

The important interview concept is Node's asynchronous, non-blocking I/O model.

Do not claim that Node was chosen specifically because of some benchmark or scalability requirement unless that was actually part of the project decision.

---

## 6. Why MongoDB?

### Answer

"MongoDB fits the data model because the application deals with business documents that can contain nested structures. For example, a DailyRecord contains arrays for sold items, expenses, wasted items and suggestions. MongoDB's document model maps naturally to that structure, while Mongoose gives us schemas and models on top of MongoDB."

### Explanation

The strongest code-based reason is the document structure and nested arrays visible in `DailyRecord`.

---

## 7. What is the overall architecture?

### Answer

"At a high level, the frontend communicates with the Node.js and Express backend through HTTP APIs. Node handles the application logic and talks to MongoDB for structured business data and S3-compatible storage for audio files. There is also a Python backend that can communicate with Node through internal HTTP endpoints, particularly for triggering daily updates and adding expenses. The exact internals of the Python service aren't included in the Node codebase."

### Explanation

This answer is intentionally careful about the Python side.

It explains the architecture without pretending to know the unseen Python implementation.

---

## 8. How does data flow through the system?

### Answer

"At the business-data level, sales, expenses and Udhar are stored as individual events. The `updateDailyRecord` service retrieves those events for a vendor and date, aggregates sales and expenses, calculates Udhar totals, active hours, transaction count and profit, and then upserts a DailyRecord. The dashboard and ledger can then consume that aggregated record, and the weekly report uses multiple DailyRecords to generate a PDF."

### Explanation

This is the central data flow of the backend.

The key method to remember is:

```text
Events → updateDailyRecord() → DailyRecord → Consumers
```

---

## 9. What is the role of the Python backend?

### Answer

"From the Node code, I can confirm that the Python backend communicates with Node through internal HTTP endpoints. In particular, Node exposes an endpoint for triggering `updateDailyRecord` and another for adding an expense. However, the Python implementation itself isn't included in this codebase, so I wouldn't claim specific AI, speech-processing or machine-learning functionality without looking at that code."

### Explanation

This is an important interview-safe answer.

It demonstrates that you understand the integration while avoiding unsupported assumptions.

---

## 10. Why are Node.js and Python separated?

### Answer

"The codebase shows that the Node and Python services communicate through internal HTTP APIs, but the provided Node code doesn't contain the architectural reasoning for why the two services were separated. So I would describe the separation as a service boundary rather than claim a specific reason. If the Python side contains AI or speech-processing logic, that would be something I'd verify from the Python code before explaining the exact reason for the split."

### Explanation

Do not invent an architectural justification that isn't documented.

A likely reason might be language-specific processing, but that is an inference and should not be presented as an established project decision.

---

## 11. What is the most important design decision in this backend?

### Answer

"I would say the separation between individual events and aggregated daily records is one of the most important design decisions. Sales, expenses and Udhar are stored as individual events, while `DailyRecord` provides a summarized view for a particular day. That gives us both transaction-level data and a convenient structure for dashboard, ledger and reporting use cases."

### Explanation

This is directly supported by the code.

The `updateDailyRecord` service acts as the aggregation boundary between the event collections and the daily summary.

---

## 12. What would you improve before putting this into production?

### Answer

"Based on the current code, I would first strengthen authentication and authorization because a complete authentication layer isn't visible. I would also improve validation and error handling consistently across all endpoints, add rate limiting and security middleware, add automated tests, and review the date and timezone handling because different parts of the code currently use local time and UTC boundaries differently. For the internal Python endpoints, I would also add proper service-to-service authentication instead of treating them as ordinary open HTTP endpoints."

### Explanation

These are recommendations, not claims about current functionality.

A particularly important issue is date handling: `updateDailyRecord()` uses UTC boundaries, while some other endpoints use local date boundaries.

The current internal routes also have no visible authentication middleware.

---

# 13. 30-Second Project Explanation

"VoiceTrace is a backend system for helping vendors manage their daily business activity. I worked with Node.js and Express to build APIs around sales, expenses and Udhar transactions. These individual events are aggregated into DailyRecords, which are then used for dashboard and ledger data and for generating weekly income reports. The backend uses MongoDB with Mongoose for structured business data and S3-compatible storage for audio recordings. There are also internal APIs through which a Python backend can interact with the Node service."

---

# 14. 1-Minute Project Explanation

"VoiceTrace is a backend system focused on managing day-to-day business records for vendors. The main business entities are sales, expenses and Udhar transactions. I model these as separate events using MongoDB and Mongoose. The important part of the design is that these events are then aggregated by a service called `updateDailyRecord`, which creates or updates a DailyRecord containing things like total income, expenses, profit, sold items, transaction count and Udhar totals.

The application can then use those daily records for dashboard and ledger views and can generate a weekly income statement as a PDF using PDFKit. For audio, the backend accepts `.m4a` recordings using Multer and stores them in S3-compatible storage using the AWS SDK, returning temporary signed URLs. There are also internal endpoints that a Python backend can call. The Python implementation isn't part of this codebase, so I would describe that integration only at the API level."

---

# 15. 2-Minute Project Explanation

"VoiceTrace is a backend system designed around maintaining structured business records for vendors. The core idea is to represent different kinds of business activity as separate events. Sales are stored as `SaleEvent`, expenses as `ExpenseEvent`, and credit transactions as `UdharEvent`. These events contain information such as the vendor, date, amount and transaction-specific details. Some of them can also contain a voice recording URL and transcript.

The important architectural decision is that I don't use those raw events directly for every dashboard operation. Instead, the backend has a daily aggregation service called `updateDailyRecord`. It retrieves all the sales, expenses and Udhar transactions for a vendor and a particular day, groups sales by item, calculates total income and expenses, calculates Udhar totals, counts transactions, determines active hours and calculates profit. It then upserts a `DailyRecord`.

That DailyRecord becomes a convenient summary layer. The home dashboard reads values such as earnings, profit, expenses and inventory information from it. The ledger uses it to return daily sales and expense information, and the reporting endpoint combines multiple DailyRecords to generate a weekly income statement PDF using PDFKit.

The backend also handles audio recordings. The recordings API uses Multer to accept `.m4a` files with a 25 MB limit, uploads them to S3-compatible storage using the AWS SDK, and generates one-hour presigned URLs for access. MongoDB stores the structured business information, while object storage handles the binary audio files.

Architecturally, the frontend communicates with Node and Express through REST APIs. Node communicates with MongoDB and S3, and there are internal endpoints that allow a Python backend to trigger operations such as daily-record updates and expense creation. Since the Python source isn't included here, I wouldn't claim exactly what the Python service does internally without looking at it.

If I were taking this toward production, I would particularly focus on authentication and authorization, service-to-service security, consistent validation and error handling, automated testing, rate limiting, and reviewing the date/timezone handling across the different endpoints."