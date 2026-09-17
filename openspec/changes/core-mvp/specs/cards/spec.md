# Cards Specification

## Purpose

Cards are the unit of work: title, description, priority, assignee, due date, labels, and optional cycle and list membership. Ordering within a list uses fractional indexing; backlog membership is a card with list_id NULL; optimistic concurrency returns 409 on stale writes.

## Requirements

### Requirement: Card CRUD and fields

An authorized member MUST be able to create, read, update, and delete cards. Card fields MUST include title, description, priority (enum), assignee_id (nullable), due_date (nullable), list_id (nullable), and cycle_id (nullable).

#### Scenario: Create card

- GIVEN a list in a board
- WHEN a member creates a card with title and priority
- THEN the card exists in the list
- AND it receives a fractional position at the end

#### Scenario: Update card fields

- GIVEN a card
- WHEN a member updates its title, assignee, and due date
- THEN all fields reflect the new values

### Requirement: Fractional-index ordering

Cards within a list MUST be ordered by fractional position keys. Inserting a card between two cards MUST assign a key strictly between theirs without rewriting the other cards' keys.

#### Scenario: Insert between cards

- GIVEN adjacent cards A and B in a list
- WHEN a card is inserted between them
- THEN the new card renders between A and B
- AND A and B keep their original position keys

#### Scenario: Insert at the end

- GIVEN a list with cards A and B
- WHEN a card is appended at the end
- THEN it renders after B
- AND A and B keep their original position keys

### Requirement: Backlog membership

A card with list_id NULL MUST be treated as being in the project backlog. Moving a card to the backlog MUST clear list_id and position; moving from backlog to a list MUST set list_id and a valid position.

#### Scenario: Move card to backlog

- GIVEN a card in a list
- WHEN it is moved to the backlog
- THEN list_id is NULL
- AND it no longer appears in the list

#### Scenario: Move card from backlog to list

- GIVEN a backlog card and a list
- WHEN it is moved into the list
- THEN list_id is set
- AND it receives a valid position

### Requirement: Atomic reorder transactions

A drag-and-drop move, within a list or across lists, MUST commit as a single atomic transaction that updates list membership and positions consistently. Concurrent reorders MUST NOT lose or duplicate cards.

#### Scenario: Cross-list move is atomic

- GIVEN a card in list L1
- WHEN it is dropped into list L2 at position 2
- THEN the card appears exactly once, in L2 at position 2
- AND L1 no longer contains it

#### Scenario: Concurrent drops stay consistent

- GIVEN two members dropping cards in the same list concurrently
- WHEN both transactions commit
- THEN all cards are present exactly once with unique positions

### Requirement: Optimistic concurrency (409)

Every mutable entity MUST carry a version. Updates MUST be conditional on the current version; a stale update MUST fail with 409 plus the current entity state, and MUST NOT modify data.

#### Scenario: Fresh update succeeds

- GIVEN a card with version 3
- WHEN a member updates it supplying version 3
- THEN the update succeeds
- AND version becomes 4

#### Scenario: Stale update returns 409

- GIVEN a card whose current version is 4
- WHEN a member submits an update with version 3
- THEN the update is rejected with 409
- AND the card data is unchanged