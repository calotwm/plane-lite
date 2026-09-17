# Teams Specification

## Purpose

Teams group users and gate access: a project is owned by one team, and only that team's members (plus admins) may work in it. Card assignees must be users with team access to the card's project.

## Requirements

### Requirement: Team CRUD

An authenticated admin MAY create, read, update, and delete teams. Deleting a team that owns projects or has members MUST be rejected.

#### Scenario: Create team

- GIVEN an authenticated admin
- WHEN the admin creates team "Engineering"
- THEN the team exists and can be listed

#### Scenario: Delete team with members rejected

- GIVEN a team with at least one member
- WHEN an admin attempts to delete it
- THEN the deletion is rejected

### Requirement: Membership management

An admin MAY add and remove team members with a role. A user MUST be a member of a team to be assigned work in that team's projects.

#### Scenario: Add member

- GIVEN an authenticated admin and a team
- WHEN the admin adds user U as a member
- THEN U appears in the team's member list

#### Scenario: Remove member

- GIVEN a team containing user U
- WHEN the admin removes U
- THEN U is no longer listed as a member

### Requirement: Team-scoped access

Access to a project's boards and cards MUST be limited to members of the project's owning team and admins; other authenticated users MUST be denied.

#### Scenario: Non-member denied

- GIVEN project P owned by team T and authenticated user U who is not in T and not an admin
- WHEN U requests P's boards
- THEN the request is denied with 403

#### Scenario: Member granted

- GIVEN project P owned by team T and authenticated user U who is a member of T
- WHEN U requests P's boards
- THEN the request succeeds

### Requirement: Valid assignees

A card assignee MUST be an active user with team access to the card's project.

#### Scenario: Non-member assignee rejected

- GIVEN project P owned by team T and user U outside T
- WHEN a card in P is assigned to U
- THEN the assignment is rejected