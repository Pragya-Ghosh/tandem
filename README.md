# Tandem: Collaborative Code Review

```
  __ __                  _                 
 |_   _|                | |                
   | |  __ _  _ __    __| |  ___  _ __ ___  
   | | / _` || '_ \  / _` | / _ \| '_ ` _ \ 
   | || (_| || | | || (_| ||  __/| | | | | |
   \_/ \__,_||_| |_| \__,_| \___||_| |_| |_|
                                               
```

**Pragya Ghosh**\
**24051500**\
**CSE-31**

*Option 4: Collaborative Network File System*\
My project is specifically meant for code files.

## Introduction
Standard version control workflows are inherently asynchronous. In fast-paced pair programming or aggressive incident-response code reviews, multiple engineers frequently need to refactor different sections of the same file simultaneously. 

Tandem is a real-time, low-latency collaborative text engine designed specifically for concurrent code editing. 


## Tech Stack & Architecture
Tandem utilizes a modern web-based Client-Server architecture to ensure sub-millisecond propagation of edits and permanent data durability.

- **Frontend:** Next.js and React (App Router) to manage the editor's UI state, file routing (`?fileId=...`), and render the line array.
- **Backend:** A Node.js and Express server handling HTTP file CRUD operations alongside real-time WebSocket communication.
- **Persistence Layer:** A server-side file manager (`DocumentManager`) maintaining atomic, authoritative code states on disk (`server/db/data/`).
- **Transport Layer:** Native WebSockets for persistent, bi-directional, full-duplex communication keyed by file rooms.

## Getting Started & Build Instructions

To run Tandem locally, you will need two separate terminal windows (one for the backend server and one for the frontend client).

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### 1. Clone the Repository & Install Dependencies
```bash
git clone https://github.com/Pragya-Ghosh/tandem.git
cd tandem
npm install
```

### 2. Run the Backend Server
The backend handles Express HTTP routes and WebSocket connections on port 5000.
```bash
cd server
node index.js
```

### 3. Run the Frontend Client
Open a second terminal window in the root directory and start the Next.js development server:
```bash
cd client
npm run dev
```

Open your browser and navigate to http://localhost:3000 to start collaborating!

## Project Scope

- **Persistent Storage:** Code files are permanently saved on the server. When users connect, they load the latest saved snapshot, and modifications are tracked via dirty-state indicators.
- **Central WebSocket Server:** A Node.js server maintaining open, concurrent two-way rooms segregated by unique file IDs.
- **Real-Time Live Editing:** Instant keystroke propagation across all connected clients viewing the same file room.
- **Line-Level Concurrency Control (OCC):** Version-tracked line edits that protect against the "Lost Update" anomaly without locking files.
- **Robust Disconnect & Deletion Handling:** Automated reconnection with state recovery, plus instant anti-ghost protection (`4404` close code handling) that safely boots users out if a file is deleted mid-session.

## Concurrency Strategy: Line-Level Optimistic Concurrency Control (OCC)
Tandem closely mirrors the conflict-resolution philosophy of Git. **Optimistic Concurrency Control (OCC)** operates on the assumption that true concurrent conflicts are rare. 

Instead of placing a restrictive "lock" on a file or line the moment someone starts typing, OCC allows all users to edit freely and simultaneously. The system only checks for conflicts at the exact millisecond an edit reaches the server. Every line of code is assigned a specific version number. When a user submits an edit, they include the version they were looking at. 

If the server detects that the line's version has changed since the user began typing (meaning someone else beat them to it), the server explicitly rejects the "stale" edit. This guarantees that code is never silently overwritten, protecting the integrity of the file without sacrificing real-time speed.

- **Versioned State:** The document is treated as an array of discrete lines. The server maintains a strict, independent version integer for every single line.
- **Rejection Mechanism:** When a client submits an edit to a line, the payload must include the `baseVersion` they are editing from. If the server's current version for that line is higher, it means another client has already modified it. The server explicitly rejects the stale edit.
- **Client-Side Resolution:** Upon rejection, the server pushes the latest authoritative state. The client's UI flashes red, overwriting the stale input with the correct logic.

## Save & Persistence Strategy
Tandem implements a multi-stage save pipeline to balance fluid typing with absolute data integrity:
- **Debounced Transmission:** Keystrokes are debounced (`600ms`) and managed through an outbox rebase system on the client side.
- **Idle-Aware Saving (`Ctrl + S`):** When manual save is triggered, pending local edits are flushed immediately. The server commit is delayed until all preceding client edits have successfully landed, ensuring the file written to disk is complete and up-to-date.

## AI Usage Disclosure
AI has been used to help figure out the basic architecture of this project. Moving forward, AI will also be used to assist with building and styling the web-based User Interface (Next.js and React components). The core backend logic, state management, and concurrency engine will be developed independently.

## System Flow Diagrams

The following diagrams illustrate how the WebSocket server handles real-time edits and strictly resolves concurrent conflicts using Line-Level OCC.

### Scenario A: Successful Edit
```
[Client A]                               [Node.js Server]                              [Client B]
    |                               (Holds Line 5, v10: "let x = 1;")                      |
    |                                            |                                         |
    |--- 1. Edit Line 5 to "let x = 2;" -------->|                                         |
    |    (Payload: line:5, base_v:10)            |                                         |
    |                                            |                                         |
    |                                            |--- 2. Version matches (10 == 10)        |
    |                                            |--- 3. Updates Line 5 to v11             |
    |                                            |                                         |
    |<-- 4. ACK (Line 5 is now v11) -------------|--- 5. Broadcast (Line 5 is now v11) --->|
    |                                            |                                         |
    |    (Client A continues typing)             |    (Client B's UI instantly updates)    |
```

### Scenario B: Concurrent Conflict (OCC Rejection)
Client A and Client B edit the exact same line at the exact same time. Client B's packet arrives first, making Client A's packet stale. The server protects the code logic by rejecting Client A's stale edit.

```
[Client A]                               [Node.js Server]                         [Client B]
    |                               (Holds Line 5, v10: "let x = 1;")                      |
    |                                            |                                         |
    |                                            |<-- 1. Edit Line 5 to "let x = 99;" -----|
    |                                            |    (Payload: line:5, base_v:10)         |
    |                                            |                                         |
    |--- 2. Edit Line 5 to "let x = 2;" -------->|--- 3. Server processes B's edit first   |
    |    (Payload: line:5, base_v:10)            |    (Updates Line 5 to v11)              |
    |                                            |                                         |
    |                                            |--- 4. Server processes A's edit next    |
    |                                            |--- 5. Version Mismatch! (10 < 11)       |
    |                                            |--- 6. REJECT A's edit                   |
    |                                            |                                         |
    |<-- 7. Reject & push latest (Line 5, v11) --|                                         |
    |                                            |                                         |
    |    (Client A's UI flashes red, overwrites  |                                         |
    |     stale input with Client B's logic)     |                                         |
```