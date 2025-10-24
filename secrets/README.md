# Docker Secrets Configuration

This directory contains secret files used by Docker Compose for secure credential management.

## Setup Instructions

1. Copy the example files and remove the `.example` extension:
   ```bash
   cp postgres_user.txt.example postgres_user.txt
   cp postgres_password.txt.example postgres_password.txt
   cp postgres_db.txt.example postgres_db.txt
   ```

2. Edit each `.txt` file with your actual credentials:
   - `postgres_user.txt` - PostgreSQL username
   - `postgres_password.txt` - PostgreSQL password
   - `postgres_db.txt` - PostgreSQL database name
   
   **Important:** Ensure there are NO trailing newlines or whitespace in these files. The value should be the only content without any line breaks.

3. The actual `.txt` files are ignored by Git (in `.gitignore`) to prevent credential leaks.

## Security Notes

- **Never commit** the actual `.txt` files to version control
- Keep these files secure and only share them through secure channels
- Update the `.example` files if you add new secrets
- For production, use environment-specific secrets with strong passwords

## Files in this Directory

- `*.txt.example` - Template files (committed to Git)
- `*.txt` - Actual secret files (ignored by Git)
- `README.md` - This file

