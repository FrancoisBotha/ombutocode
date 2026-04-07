# Use Case: User Login

## 1. Overview
- **Use Case ID:** UC-001
- **Name:** User Login
- **Primary Actor:** End User
- **Description:** User authenticates to access the application
- **Level:** User goal

---

## 2. Preconditions
- User has a registered account
- System is online and accessible

---

## 3. Trigger
- User navigates to the login page

---

## 4. Main Success Scenario
1. User enters email and password
2. System validates credentials
3. System creates a session token
4. System redirects to dashboard

---

## 5. Alternate Flows

### 5.1 Invalid Credentials
- 2a. Validation fails
- 2b. System shows error message
- 2c. User retries

### 5.2 Account Locked
- 2a. Too many failed attempts
- 2b. System locks account for 15 minutes
- 2c. System shows lockout message

---

## 6. Postconditions
- **Success:** User has an active session
- **Failure:** No session created, error displayed
