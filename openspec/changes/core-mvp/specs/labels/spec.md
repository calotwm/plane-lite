# Labels Specification

## Purpose

Labels are project-scoped tags (name + color) applied to cards through a many-to-many relation: a card may carry many labels, and a label may tag many cards.

## Requirements

### Requirement: Label CRUD

An authorized member MUST be able to create, read, update, and delete labels within a project. Label names MUST be unique within a project.

#### Scenario: Create label

- GIVEN a project
- WHEN a member creates label "Bug" with a color
- THEN the label exists and can be applied to cards

#### Scenario: Duplicate name rejected

- GIVEN an existing label "Bug" in the project
- WHEN a member creates another label named "Bug"
- THEN creation is rejected

### Requirement: Card-label association

A card MAY carry zero or more labels; a label MAY tag zero or more cards. Adding or removing a label on a card MUST update only that association.

#### Scenario: Apply label to card

- GIVEN a card and a label in the same project
- WHEN the label is applied to the card
- THEN the card reports the label among its labels

#### Scenario: Remove label from card

- GIVEN a card with label L applied
- WHEN L is removed from the card
- THEN the card no longer reports L
- AND other cards tagged L are unaffected

### Requirement: Project scope of labels

A card MUST only accept labels from its own project.

#### Scenario: Cross-project label rejected

- GIVEN a card in project P1 and a label in project P2
- WHEN applying the label is attempted
- THEN it is rejected