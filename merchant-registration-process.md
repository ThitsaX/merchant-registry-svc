# Merchant Registration Process 

1. Clone the repo into local machine<br><br>

2. Configure email only if notifications and emailed forgot-password links are wanted.
- No provider is required: keep `EMAIL_PROVIDER=none`.
- For SendGrid, set `EMAIL_PROVIDER=sendgrid`, `EMAIL_FROM`, and
  `SENDGRID_API_KEY`. Temporary passwords are never sent by email.<br><br>

3. Create reCAPTCHA Site Key and Secret Key
  - Register at Google reCAPTCHA and create new reCAPTCHA v2 Checkbox
  - Use Client Site Key and Update the VITE_RECAPTCHA_SITE_KEY in the ./packages/acquirer-frontend/.env and docker-compose.yml
  - Use Server Site Key and Update the RECAPTCHA_SECRET_KEY in the ./packages/acquirer-backend/.env and docker-compose.yml<br><br>

4. Run the command `docker-compose up –-build`<br><br>
5. Merchant registry portal should be accessible at -> http://localhost:5173<br><br>
6. Login to the portal(http://localhost:5173) as the Hub Super Admin
  - Create the Hub Admin at the user management page (http://localhost:5173/portal-user-management/user-management/add-new-user).
  - Copy the temporary password shown once and share it through a secure channel.
  - The Hub Admin signs in with it and must immediately choose a new password.<br><br>
7. Login as the Hub Admin using the new password.
  - Create the DFSP Admin from the user management page.
  - Copy and securely share the one-time temporary password. The DFSP Admin must
    replace it at first login.<br><br>
8. After the DFSP Admin replaces the temporary password, login as that user.
  - Create a new Merchant record by filling in the merchant registry form (http://localhost:5173/registry/registry-form)
  - Provide the details as needed 
  - Submit the form 
  - The Merchant will appear in the merchant records (http://localhost:5173/merchant-records/all-merchant-records)
  - Create the DFSP Operator at the user management page, then copy and securely
    share the temporary password.<br><br>
9. After the DFSP Operator replaces the temporary password, login using the new password.
  - Approve the pending merchants in the merchant records http://localhost:5173/merchant-records/pending-merchant-records
  - View the approved merchants in the merchant record http://localhost:5173/merchant-records/alias-generated-merchant-records<br><br>
10. The merchant is successfully registered <br><br>
