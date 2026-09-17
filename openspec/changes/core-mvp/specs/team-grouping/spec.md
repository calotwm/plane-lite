# Team Grouping Specification

## Purpose

Boards may render cards grouped by the assignee's team. Grouping is a presentation view over the existing data model — no schema change and no change to card ordering.

## Requirements

### Requirement: Group-by-team board view

A board view MUST be able to group cards by the team of their assignee. Unassigned cards MUST appear in a distinct group.

#### Scenario: Cards grouped by assignee's team

- GIVEN a board with card X assigned to user in team T1 and card Y assigned to user in team T2
- WHEN the group-by-team view is rendered
- THEN card X appears under T1 and card Y under T2

#### Scenario: Unassigned group

- GIVEN a board with a card that has no assignee
- WHEN the group-by-team view is rendered
- THEN the card appears in the unassigned group

### Requirement: View-only, no data mutation

Grouping MUST NOT alter card storage, list membership, or fractional ordering. Enabling and disabling grouping MUST return the same underlying board state.

#### Scenario: Toggle preserves order

- GIVEN a board with cards in a list
- WHEN grouping is enabled and then disabled
- THEN card positions and list membership are unchanged