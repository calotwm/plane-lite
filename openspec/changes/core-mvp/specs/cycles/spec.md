# Cycles Specification

## Purpose

Cycles are time-boxed sprints scoped to a project, with start and end dates and a status. A card may belong to at most one cycle of its project.

## Requirements

### Requirement: Cycle CRUD

An authorized member MUST be able to create, read, update, and delete cycles within a project.

#### Scenario: Create cycle

- GIVEN a project
- WHEN a member creates a cycle with name, start date, and end date
- THEN the cycle exists under the project

#### Scenario: Delete cycle

- GIVEN a cycle with assigned cards
- WHEN an authorized member deletes it
- THEN the cycle is removed
- AND its cards become cycle-less (cycle_id NULL)

### Requirement: Cycle validity

A cycle's end date MUST NOT precede its start date.

#### Scenario: Invalid date range rejected

- GIVEN a cycle whose end date is before its start date
- WHEN a member attempts to create or update it
- THEN the operation is rejected

### Requirement: Card assignment

A card MUST be assignable to at most one cycle; assigning a card to a second cycle MUST replace the previous assignment. Only cycles of the card's project MAY be assigned.

#### Scenario: Assign card to cycle

- GIVEN a cycle and a card in the same project
- WHEN the card is assigned to the cycle
- THEN the card appears in the cycle's card list

#### Scenario: Reassignment replaces

- GIVEN a card assigned to cycle C1
- WHEN it is assigned to cycle C2
- THEN the card belongs to C2 only

#### Scenario: Cross-project cycle rejected

- GIVEN a card in project P1 and a cycle in project P2
- WHEN assignment is attempted
- THEN it is rejected

### Requirement: Cycle status derivation

A cycle's status MUST be derived from its dates and status field. Done cycles MUST remain readable with their cards.

#### Scenario: Past cycle is done

- GIVEN a cycle whose end date is in the past
- WHEN its status is read
- THEN it is reported as done
- AND its cards remain visible