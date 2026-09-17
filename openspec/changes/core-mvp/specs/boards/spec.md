# Boards Specification

## Purpose

Boards hold ordered lists of cards. A project may contain multiple boards, and a board may contain multiple lists. Boards and lists use integer positions that are renumbered on move.

## Requirements

### Requirement: Board CRUD

An authorized project member or admin MUST be able to create, read, update, and delete boards within a project. A new board SHOULD be appended at the end of the project's board order.

#### Scenario: Create board

- GIVEN a project and an authorized member
- WHEN the member creates board "Sprint Board"
- THEN the board exists under the project
- AND it is positioned after existing boards

#### Scenario: Delete board

- GIVEN a board containing lists
- WHEN an authorized member deletes the board
- THEN the board, its lists, and their cards are removed

### Requirement: List CRUD

An authorized member MUST be able to create, rename, move, and delete lists within a board. A new list SHOULD be appended at the end of the board's list order.

#### Scenario: Create list

- GIVEN a board
- WHEN a member adds list "Done"
- THEN the list exists with a position at the end

#### Scenario: Delete list

- GIVEN a list containing cards
- WHEN an authorized member deletes the list
- THEN the list is removed
- AND its cards move to the backlog (list_id NULL)

### Requirement: Integer ordering with renumber

Board and list positions MUST be sequential integers starting at 0 with no duplicates. Moving a board or list MUST renumber positions in one atomic operation.

#### Scenario: Move list renumbers

- GIVEN lists A(0), B(1), C(2)
- WHEN list C is moved to index 0
- THEN the resulting order is C(0), A(1), B(2)

#### Scenario: Concurrent moves serialize

- GIVEN two members moving different lists at the same time
- WHEN both moves commit
- THEN the final positions are unique and sequential with no lost lists

### Requirement: Board archive and restore

An authorized member MUST be able to archive and restore a board. Archiving MUST be non-destructive: it MUST NOT remove or modify the board's lists, cards, or labels. An archived board MUST be excluded from default board listings and MUST remain reachable through an explicit archived-board view. Restoring MUST return the board to its exact prior state. Archiving MUST NOT replace deletion: an archived board MUST still be deletable with the existing hard-cascade behavior.

#### Scenario: Archive preserves board content

- GIVEN a board with lists, cards, and applied labels
- WHEN an authorized member archives the board
- THEN the board is marked archived
- AND every list, card, and label is intact and unchanged

#### Scenario: Archived board excluded from default view

- GIVEN an archived board in a project
- WHEN a member lists that project's boards
- THEN the archived board is absent from the default listing
- AND it is reachable through the project's archived-board view

#### Scenario: Restore returns exact prior state

- GIVEN an archived board with lists L1..Ln and cards in a known order
- WHEN an authorized member restores it
- THEN it appears in the default board listing again
- AND its lists, cards, and positions match the pre-archive state

#### Scenario: Delete remains available for archived boards

- GIVEN an archived board containing lists and cards
- WHEN an authorized member deletes it
- THEN the board, its lists, and their cards are permanently removed

### Requirement: Archived board mutation guard

Write operations targeting an archived board MUST be rejected and MUST NOT modify data. Rejections MUST be reported as 409 Conflict with a reason identifying the archived state, distinguishable from a stale-version conflict. Restoring the board MUST re-enable writes with no further action.

#### Scenario: Card creation on an archived board rejected

- GIVEN an archived board containing list L
- WHEN a member creates a card in L
- THEN the request is rejected with 409 identifying the archived state
- AND no card is created

#### Scenario: Card move into an archived board rejected

- GIVEN an archived board containing list L and a card in another board
- WHEN the card is moved into L
- THEN the move is rejected
- AND the card remains in its original list

#### Scenario: List edit on an archived board rejected

- GIVEN an archived board with lists A(0) and B(1)
- WHEN a member renames or reorders one of its lists
- THEN the change is rejected
- AND list names and positions are unchanged

#### Scenario: Restore re-enables writes

- GIVEN an archived board that is then restored
- WHEN a member creates a card in one of its lists
- THEN the write succeeds

### Requirement: Board archive isolation

Archiving a board MUST NOT affect its project, its sibling boards, or their archive state. Archiving a project MUST NOT archive or delete the boards it contains.

#### Scenario: Archiving a board leaves the project unchanged

- GIVEN project P with boards B1 and B2
- WHEN B1 is archived
- THEN P is not archived and is unchanged
- AND B2 remains in the default board listing

#### Scenario: Project archive does not archive boards

- GIVEN project P with board B
- WHEN P is archived
- THEN B is not marked archived
- AND B's lists and cards are unchanged