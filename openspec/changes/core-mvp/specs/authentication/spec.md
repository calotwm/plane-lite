# Authentication Specification

## Purpose

Email + password authentication for internal users: Argon2id password hashing, httpOnly server-side session cookies, login rate limiting, admin-provisioned accounts (no public signup), and a stable session/user provider seam so an OIDC provider can be added post-MVP. No self-service password reset and no email flows in MVP — admins reset passwords.

## Requirements

### Requirement: Admin-provisioned user accounts

The system MUST NOT expose a public signup endpoint. User accounts MUST be created by an administrator; only an admin MAY create, deactivate, or reset a user's password.

#### Scenario: Admin provisions a user

- GIVEN an authenticated administrator
- WHEN the admin creates a user with email, name, and password
- THEN the user account exists with a hashed password
- AND the user can log in with those credentials

#### Scenario: Anonymous signup is rejected

- GIVEN an unauthenticated visitor
- WHEN the visitor attempts to register a new account
- THEN the attempt is rejected
- AND no account is created

### Requirement: Password hashing with Argon2id

The system MUST store passwords as Argon2id hashes with a per-user salt and SHOULD use a vetted library with its recommended defaults. The system MUST NOT store plaintext or reversibly-encrypted passwords.

#### Scenario: Password is stored hashed

- GIVEN an admin creates a user with password "s3cret!"
- WHEN the stored record is inspected
- THEN the stored value is an Argon2id hash, not the plaintext
- AND the hash verifies against "s3cret!"

### Requirement: Login with session cookie

The system MUST authenticate email + password and, on success, MUST establish a server-side session delivered as an httpOnly, SameSite cookie. The system MUST reject login for inactive users.

#### Scenario: Valid credentials yield a session

- GIVEN an active user with correct credentials
- WHEN the user logs in
- THEN the response sets an httpOnly session cookie
- AND subsequent authenticated requests succeed

#### Scenario: Wrong password rejected

- GIVEN a user with a correct email and wrong password
- WHEN the user attempts to log in
- THEN the attempt returns 401
- AND no session cookie is issued

#### Scenario: Inactive user cannot log in

- GIVEN a user whose account is deactivated
- WHEN the user attempts to log in with correct credentials
- THEN the attempt is rejected

### Requirement: Login rate limiting

The system MUST rate-limit failed login attempts, returning 429 once the configured threshold is exceeded within the window.

#### Scenario: Repeated failures are throttled

- GIVEN N consecutive failed logins for an account within the window (N = configured threshold)
- WHEN the (N+1)th attempt is made
- THEN the attempt is rejected with 429

### Requirement: Session validation and logout

Protected operations MUST require a valid session. Logout MUST invalidate the session server-side.

#### Scenario: Unauthenticated request denied

- GIVEN no valid session cookie
- WHEN a protected operation is requested
- THEN the request is rejected with 401

#### Scenario: Logout invalidates session

- GIVEN an authenticated session
- WHEN the user logs out
- THEN the session is invalidated
- AND the cookie can no longer authenticate

### Requirement: OIDC-ready provider seam

The auth module MUST expose a stable session/user provider interface such that adding an OIDC provider does not change session validation or authorization behavior.

#### Scenario: Provider swap preserves behavior

- GIVEN a second provider implementing the documented interface
- WHEN a user authenticates through that provider
- THEN session validation and authorization behave identically to password login

### Requirement: Admin password reset (no self-service reset)

The system MUST NOT provide a user-facing password reset flow in MVP; an admin MUST be able to reset a user's password.

#### Scenario: Reset requires admin

- GIVEN an authenticated administrator
- WHEN the admin resets a user's password
- THEN the user's stored hash is replaced
- AND the old password no longer works

#### Scenario: No public reset endpoint

- GIVEN an unauthenticated visitor
- WHEN the visitor requests a password reset
- THEN no reset flow exists and the request cannot succeed