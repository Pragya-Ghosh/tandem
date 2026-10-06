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

* **Frontend:** Next.js and React to manage the editor's UI state and render the text array.
* **Backend:** A Node.js server that manages WebSocket connections and keeps the document synchronized across all users.
* **Database Layer:** A persistent relational database (PostgreSQL via Supabase) to store the authoritative code state and safely commit concurrent edits.
* **Transport Layer:** Native WebSockets for persistent, bi-directional, full-duplex communication.

## Project Scope

* **Persistent Database:** The code is permanently saved in a database. When users connect, they load the latest saved version, and all new edits are continuously saved back so nothing is lost.
* **Central WebSocket Server:** A Node.js server that keeps an open, two-way connection with multiple users at the exact same time.
* **Real-Time Live Editing:** As soon as one person types, their keystrokes instantly appear on everyone else's screen.
* **Line-Level Concurrency Control (OCC):** A system that tracks edits line-by-line. If two people try to rewrite the exact same line at the exact same millisecond, the server safely rejects the slower edit to prevent the code from getting corrupted.
* **Offline Recovery:** If a user's Wi-Fi drops and they reconnect, the system automatically pulls the latest updated code from the server to get them perfectly back in sync.

## Concurrency Strategy: Line-Level Optimistic Concurrency Control (OCC)
Tandem closely mirrors the conflict-resolution philosophy of Git. **Optimistic Concurrency Control (OCC)** operates on the assumption that true concurrent conflicts are rare. 

Instead of placing a restrictive "lock" on a file or line the moment someone starts typing, OCC allows all users to edit freely and simultaneously. The system only checks for conflicts at the exact millisecond an edit reaches the server. Every line of code is assigned a specific version number. When a user submits an edit, they include the version they were looking at. 

If the server detects that the line's version has changed since the user began typing (meaning someone else beat them to it), the server explicitly rejects the "stale" edit. This guarantees that code is never silently overwritten, protecting the integrity of the file without sacrificing real-time speed.

* **Versioned State:** The document is not treated as a single massive string, but as an array of discrete lines. The server maintains a strict, independent version integer for every single line.
* **Rejection Mechanism:** When a client submits an edit to a line, the payload must include the `base_version` they are editing from. If the server's current version for that line is higher, it means another client has already modified it. The server explicitly rejects the stale edit to prevent the "Lost Update" anomaly.
* **Client-Side Resolution:** Upon rejection, the server pushes the latest authoritative state to the lagging client. The client's UI flags the collision, forcing the developer to explicitly review the updated logic before submitting a new edit.

## Disconnect Handling
The system is designed to be robust against sudden network failures, ensuring the editor remains stable if a developer drops offline.

* **Connection State:** If a client drops due to packet loss or Wi-Fi failure, the UI locks the editor to prevent the user from making un-syncable offline edits.
* **Reconnection Sync:** Upon reconnecting, the client fires a `sync_state` request. The server responds with the complete, latest array of versioned lines, immediately overwriting any stale data on the client side and ensuring they resume with a perfectly consistent view of the file.


## AI Usage Disclosure
AI has been used to help figure out the basic architecture of this project. Moving forward, AI will also be used to assist with building and styling the web-based User Interface (Next.js and React components). The core backend logic, state management, and concurrency engine will be developed independently.

## System Flow Diagrams

The following diagrams illustrate how the WebSocket server handles real-time edits and strictly resolves concurrent conflicts using Line-Level OCC.

### Scenario A: Successful Edit 
Client A edits a line, the version matches the server's state, and the edit is successfully broadcasted to all other connected clients.
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