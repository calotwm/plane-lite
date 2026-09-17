# Projects Specification

## Purpose

Projects are the top-level container: a named workspace owned by one team, holding boards, cards, cycles, and labels. Members of the owning team and admins may manage the project.

## Requirements

### Requirement: Project creation

An authenticated user MAY create a project with a name and an owning team. The system MUST reject a project without a valid owning team.

#### Scenario: Create project

- GIVEN an authenticated user who is a member of team T
- WHEN the user creates project "Q3 Launch" owned by T
- THEN the project exists and appears in the user's project list

#### Scenario: Missing owning team rejected

- GIVEN an authenticated user
- WHEN the user creates a project without an owning team
- THEN creation is rejected

### Requirement: Project CRUD authorization

Only members of the owning team and admins MUST be able to update or delete a project. Deleting a project MUST remove its dependent boards, lists, cards, cycles, and labels.

#### Scenario: Owner updates project

- GIVEN a member of the owning team
- WHEN the member renames the project
- THEN the change is persisted

#### Scenario: Non-member update denied

- GIVEN a user outside the owning team who is not an admin
- WHEN the user attempts to update the project
- THEN the request is denied with 403

#### Scenario: Delete cascades children

- GIVEN a project with boards, cards, and cycles
- WHEN the owning team's admin deletes the project
- THEN the project and all its dependent records are removed

### Requirement: Project listing scoping

The project list MUST show only projects whose owning team the user belongs to, plus all projects for admins.

#### Scenario: Scoped listing

- GIVEN user U in team T1 and project P2 owned by team T2
- WHEN U lists projects
- THEN P2 is absent from the list unless U is an admin

### Requirement: Project archive and restore

Only members of the owning team and admins MUST be able to archive and restore a project. Archiving MUST be non-destructive: it MUST NOT remove or modify the project's boards, lists, cards, cycles, or labels. Restoring MUST return the project and its contents to their exact prior state. Archiving MUST NOT replace deletion: an archived project MUST still be deletable with the existing cascade behavior.

#### Scenario: Archive preserves all children

- GIVEN project P with boards, lists, cards, cycles, and labels
- WHEN an authorized member archives P
- THEN P is marked archived
- AND every board, list, card, cycle, and label is intact and unchanged

#### Scenario: Restore returns exact prior state

- GIVEN an archived project P
- WHEN an authorized member restores it
- THEN P appears in the default project list again
- AND its boards, cycles, and labels match the pre-archive state

#### Scenario: Delete remains available for archived projects

- GIVEN an archived project P with boards and cycles
- WHEN an admin deletes P
- THEN P and all its dependent records are permanently removed

### Requirement: Archived project visibility and board non-mutation

An archived project MUST be excluded from the default project list and MUST remain reachable through an explicit archived-project view. Its boards MUST be hidden from default board listings while it is archived; those boards MUST NOT be deleted and MUST NOT be individually marked archived. Restoring the project MUST restore that visibility with the boards in their prior state.

#### Scenario: Archived project hidden by default

- GIVEN an archived project P owned by team T
- WHEN a member of T lists projects
- THEN P is absent from the default list
- AND P appears in the archived-projects view

#### Scenario: Boards hidden without being archived

- GIVEN project P containing board B
- WHEN P is archived
- THEN B is absent from default board listings
- AND B's own archive state is unchanged

#### Scenario: Restore restores board visibility

- GIVEN an archived project P containing board B that was never archived
- WHEN P is restored
- THEN B appears in the default board listings again

### Requirement: Archived project mutation guard

Writes targeting any board, list, or card inside an archived project MUST be rejected with 409 Conflict and a reason identifying the archived state, and MUST NOT modify data. Restoring the project MUST re-enable writes with no further action.

#### Scenario: Board creation in an archived project rejected

- GIVEN an archived project P
- WHEN a member creates a board in P
- THEN the request is rejected with 409 identifying the archived state
- AND no board is created

#### Scenario: Card write inside an archived project's board rejected

- GIVEN archived project P containing board B with list L
- WHEN a member creates or moves a card in L
- THEN the write is rejected with 409
- AND no card data changes

#### Scenario: Restore re-enables writes

- GIVEN an archived project P that is then restored
- WHEN a member creates a card in a board of P
- THEN the write succeeds

### Requirement: Project archive isolation

Archiving a project MUST NOT change the archive state of its boards and MUST NOT archive or delete any sibling project.

#### Scenario: Sibling projects unaffected

- GIVEN projects P1 and P2 owned by team T
- WHEN P1 is archived
- THEN P2 remains in the default project list
- AND P2 is not archived