# Flobetto SACCO Hub

A SACCO information management system for Flobetto Primary Staff Savings and Credit Cooperative Ltd.

## Overview

This project provides a secure member portal and administrative dashboard for managing:

- members and staff profiles
- savings and withdrawals
- shares and balances
- loans and repayments
- transaction history
- reports and financial summaries
- self-service member registration with linked member records
- monthly savings and share plans, tracked separately from posted payments
- role-based access control

## Tech stack

- React + Vite
- TypeScript
- TanStack Router
- Tailwind CSS
- Supabase

## Local setup

1. Install dependencies:
   npm install
2. Start the development server:
   npm run dev -- --host 0.0.0.0 --port 8080
3. Open the app in the browser at:
   http://localhost:8080/

## Deploy to Vercel

Import this repository into Vercel. The included `vercel.json` uses `npm run build`, serves the generated client assets, and routes SSR requests through the Vercel function adapter.

Add these environment variables in the Vercel project settings for Production, Preview, and Development as needed:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=https://your-project.vercel.app
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must not be exposed to client-side code. After the first deployment, update `NEXT_PUBLIC_SITE_URL` to the deployed domain used for password-reset links.

## Environment variables

Create a local environment file with your Supabase configuration:

```bash
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
```

Apply the Supabase migrations in `supabase/migrations` before using member self-registration or monthly plan tracking.

## Phone sign-in and PINs

- Enable Phone authentication in Supabase Auth. Disable phone confirmations to allow registration without sending SMS OTPs; an SMS provider is not needed while confirmations are disabled.
- Set Supabase's minimum password length to 6 and allow numeric-only values; the app uses the Supabase Auth password field for the requested 6-digit PIN.
- New and staff-created accounts sign in with their Ugandan phone number and PIN. Email collected during registration is retained as contact information.
- Existing email/password users can use **Set up phone + PIN** on the sign-in page. They must authenticate with current credentials, and the phone entered must match the SACCO membership record.
- Forgotten PINs must be reset by a SACCO administrator; self-service SMS recovery is disabled.

A six-digit PIN is weaker than a passphrase. Because phone numbers are not SMS-verified while OTP is disabled, verify membership phone numbers through the SACCO office before linking accounts. Use Supabase Auth rate limits and enable additional authentication controls for this financial application where possible.

## Notes

This app is intended to be run as a normal local project and is not tied to a hosted Lovable configuration.

Savings withdrawals.

Savings transfers.

Automatic payroll deductions where applicable.

Every transaction should have:

Transaction ID.

Member ID.

Date.

Transaction type.

Amount.

Payment method.

Reference/receipt number.

Description.

Recorded by.

Verification status.

Timestamp.

Automatically update the member's savings balance after every approved transaction.

5. SHARES MANAGEMENT

Create a module for managing SACCO shares.

Features:

Share registration.

Number of shares purchased.

Share price/value.

Total share value.

Share purchase history.

Share transfer where permitted.

Share balance.

Share reports.

The system should automatically calculate the total value of shares owned by each member.

6. LOAN MANAGEMENT

Create a complete loan-management system.

Loan Application

Members should be able to apply for loans by providing:

Loan type.

Amount requested.

Loan purpose.

Preferred repayment period.

Supporting documents where necessary.

Guarantors where applicable.

The system should automatically check eligibility based on SACCO rules.

Loan Types

Allow administrators to configure different loan products, such as:

Emergency Loan.

Development Loan.

School Fees Loan.

Salary Loan.

Business Loan.

Asset/Development Loan.

Other configurable loan products.

Each loan product should support configurable:

Maximum amount.

Interest rate.

Repayment period.

Processing fee.

Insurance/risk fee.

Penalties.

Eligibility requirements.

7. LOAN APPROVAL WORKFLOW

Create a controlled approval process:

Application → Review → Committee Approval → Approval/Rejection → Disbursement → Repayment → Completion

The system should record:

Applicant.

Application date.

Amount requested.

Amount approved.

Loan officer/reviewer.

Committee decision.

Approval date.

Rejection reason where applicable.

Disbursement date.

Repayment schedule.

Maintain a complete history of every decision.

8. LOAN REPAYMENTS

Create an automated loan repayment module.

Support:

Monthly repayments.

Principal payments.

Interest payments.

Partial payments.

Early repayment.

Payroll deductions.

Manual payments.

Penalty payments.

Automatically calculate:

Principal outstanding.

Interest outstanding.

Total amount paid.

Remaining balance.

Next repayment date.

Amount overdue.

Penalties.

Generate a repayment schedule for every approved loan.

9. GUARANTOR MANAGEMENT

Allow members to provide guarantors where required.

Record:

Borrower.

Guarantor.

Guaranteed amount.

Date of guarantee.

Guarantor approval/confirmation.

Guarantee status.

Prevent a member from guaranteeing amounts beyond configurable SACCO limits.

10. TRANSACTION MANAGEMENT

Create a centralized transaction ledger.

Transaction categories should include:

Savings deposits.

Savings withdrawals.

Share purchases.

Loan disbursements.

Loan repayments.

Interest payments.

Penalties.

Fees.

Bank transactions.

Cash transactions.

Other income.

Other expenses.

Every transaction must have a unique reference number and audit trail.

11. PAYMENT METHODS

Allow transactions through configurable payment methods such as:

Cash.

Bank transfer.

Mobile money.

Salary deduction.

Cheque.

Other methods.

The system should allow administrators to configure payment channels.

12. MEMBER STATEMENTS

Generate professional member statements containing:

Member details.

Opening balance.

Savings deposits.

Withdrawals.

Shares.

Loan disbursements.

Loan repayments.

Interest.

Fees.

Penalties.

Closing balance.

Allow statements to be filtered by date and downloaded/printed as PDF.

13. FINANCIAL REPORTING

Create comprehensive reports including:

Member Reports

Membership register.

Active/inactive members.

New members.

Member contributions.

Member balances.

Savings Reports

Total savings.

Savings by member.

Savings by month.

Deposits.

Withdrawals.

Loan Reports

Loans issued.

Outstanding loans.

Fully paid loans.

Overdue loans.

Loans by product.

Loans by member.

Loan repayment performance.

Loan aging report.

Financial Reports

Income and expenditure.

Cashbook.

Bank reconciliation.

Transaction summary.

SACCO financial position.

Monthly financial summary.

Reports should support filtering by:

Date.

Member.

Department.

Transaction type.

Loan type.

Payment method.

Allow reports to be exported to PDF and Excel.

14. PAYROLL DEDUCTIONS

Because this is a school staff SACCO, create a payroll-deduction feature.

Allow authorized users to:

Record monthly staff deductions.

Upload/import deduction schedules.

Allocate deductions to savings.

Allocate deductions to loan repayments.

Allocate deductions to shares.

Identify unpaid or incomplete deductions.

Reconcile payroll deductions.

Generate monthly deduction schedules for the school accounts/payroll office.

15. NOTIFICATIONS

Create an internal notification system.

Notify members about:

Loan approval/rejection.

Loan disbursement.

Upcoming repayment.

Missed repayment.

Savings deposits.

Withdrawals.

Account updates.

SACCO announcements.

Where integrated, support:

SMS.

Email.

In-system notifications.

16. SEARCH AND FILTERING

Provide powerful search functionality across the system.

Users should be able to search by:

Member name.

Member ID.

Staff number.

Telephone number.

Transaction ID.

Loan ID.

Receipt number.

Provide filters for dates, transaction types, statuses and departments.

17. AUDIT TRAIL

Every important action must be recorded.

Track:

User.

Action performed.

Date and time.

Previous value.

New value where applicable.

IP/device information where appropriate.

Transaction reference.

Administrators should be able to view and filter audit logs.

No financial transaction should be permanently deleted without appropriate authorization. Prefer reversal/voiding with a reason and audit record.

18. SYSTEM SETTINGS

Create an administration section where authorized users can configure:

SACCO name.

SACCO logo.

Address.

Telephone numbers.

Email.

Membership rules.

Share value.

Minimum savings.

Loan limits.

Interest rates.

Loan periods.

Penalties.

Transaction types.

Payment methods.

User roles.

Approval limits.

Notification settings.

Financial year.

Receipt numbering.

19. SECURITY

The system must prioritize security.

Implement:

Secure authentication.

Strong password requirements.

Password reset.

Role-based access control.

Session management.

Data validation.

Encryption for sensitive information.

Audit logging.

Protection against unauthorized access.

Automatic logout after inactivity.

Regular database backups.

Backup restoration functionality.

Financial records should not be editable by unauthorized users.

20. DATABASE DESIGN

Use a well-structured relational database.

Core tables should include, at minimum:

Users.

Roles.

Permissions.

Members.

Departments.

Next of Kin.

Shares.

Savings Accounts.

Savings Transactions.

Loan Products.

Loan Applications.

Loans.

Guarantors.

Loan Repayments.

Transactions.

Payment Methods.

Payroll Deductions.

Notifications.

Audit Logs.

System Settings.

Use appropriate primary keys, foreign keys, indexes and transaction integrity rules.

21. USER INTERFACE

Create a professional interface suitable for a school SACCO.

The design should be:

Clean.

Modern.

Responsive.

Mobile-friendly.

Easy to navigate.

Professional.

Suitable for both desktop and mobile devices.

Use a clear sidebar/menu containing:

Dashboard
Members
Savings
Shares
Loans
Repayments
Guarantors
Transactions
Payroll Deductions
Reports
Notifications
Users & Roles
Audit Logs
Settings

Use tables with pagination, search, filtering and sorting.

22. RECEIPTS AND DOCUMENTS

Generate professional printable documents including:

Savings deposit receipts.

Withdrawal receipts.

Loan application forms.

Loan approval forms.

Loan repayment receipts.

Member statements.

Loan schedules.

Financial reports.

Membership certificates/cards where required.

Include the SACCO name and logo on official documents.

23. DASHBOARD ANALYTICS

Include visual analytics such as:

Monthly savings chart.

Monthly loan disbursement chart.

Monthly repayment chart.

Membership growth chart.

Loan portfolio chart.

Outstanding vs paid loans.

Savings vs loans comparison.

Allow administrators to change the reporting period.

24. DATA VALIDATION AND BUSINESS RULES

Implement configurable SACCO rules, including:

Minimum savings requirement before borrowing.

Maximum borrowing limit.

Loan-to-savings ratio.

Maximum number of active loans.

Guarantor requirements.

Repayment period limits.

Interest calculation method.

Penalty calculation.

Withdrawal restrictions.

Membership status restrictions.

The system must prevent invalid transactions and clearly explain why a transaction cannot be processed.

25. DATA EXPORT AND BACKUP

Provide:

Excel export.

PDF export.

CSV export where appropriate.

Automated database backups.

Manual backup option.

Restore functionality restricted to administrators.

26. APPROVAL AND AUTHORIZATION

Implement multi-level authorization for sensitive activities.

Examples:

Savings Withdrawal:
Request → Verification → Approval → Payment

Loan:
Application → Review → Committee Approval → Disbursement

Financial Adjustment:
Request → Authorization → Adjustment → Audit Log

Allow approval levels to be configured by SACCO management.

27. MEMBER PORTAL

Each member should have a personal portal showing:

My Profile

Personal details.

My Savings

Current balance.

Deposits.

Withdrawals.

My Shares

Number and value of shares.

My Loans

Active loans.

Loan balance.

Repayment schedule.

Repayment history.

My Statements

Downloadable statements.

My Applications

Loan applications and statuses.

28. ADMINISTRATOR PORTAL

The administrator should have complete visibility of the SACCO.

The dashboard should provide quick access to:

Register member.

Record savings.

Record withdrawal.

Register shares.

Review loan application.

Approve loan.

Record repayment.

Generate report.

Manage users.

View audit logs.

29. SYSTEM PERFORMANCE

The application should:

Load quickly.

Handle multiple concurrent users.

Support large transaction volumes.

Use pagination for large datasets.

Validate transactions before saving.

Maintain database consistency.

Prevent duplicate transactions.

Provide meaningful error messages.

30. TECHNOLOGY REQUIREMENTS

Build the system using a modern, scalable technology stack.

The architecture should separate:

Frontend/UI.

Backend/API.

Database.

Authentication/authorization.

Reporting.

Notification services.

The system should be designed so that future integrations can be added, including:

School payroll systems.

Mobile money APIs.

Banking APIs.

SMS gateways.

Email services.

Mobile applications.

31. DEMO DATA

Populate the development/demo environment with realistic sample data for:

Members.

Savings.

Shares.

Loans.

Repayments.

Transactions.

Reports.

Use fictional staff names and data only.

32. FINAL DELIVERABLE

Produce a fully functional FLOBBETO PRIMARY STAFF SAVINGS AND CREDIT COOPERATIVE LTD SACCO INFORMATION MANAGEMENT SYSTEM with:

Secure login.

Role-based access control.

Member management.

Savings management.

Share management.

Loan management.

Guarantor management.

Loan approval workflow.

Loan repayment management.

Payroll deductions.

Transaction ledger.

Member statements.

Financial reports.

Dashboard analytics.

Notifications.

Audit trails.

System settings.

Data export.

Backup and recovery.

Responsive mobile-friendly interface.

The system should be secure, accurate, auditable, easy to use and scalable, while maintaining strong financial controls and complete accountability for every SACCO transaction.

Branding

Use the official organization name throughout the application:

FLOBBETO PRIMARY STAFF SAVINGS AND CREDIT COOPERATIVE LTD

Provide configurable areas for the SACCO logo, contact details and official branding.

P.O.Box 137 Hoima City (U)

Tel: 0787760259/0772364375

Key Principle

Every financial transaction must be traceable from initiation to authorization, posting, reporting and reconciliation. No transaction should disappear from the audit trail.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
