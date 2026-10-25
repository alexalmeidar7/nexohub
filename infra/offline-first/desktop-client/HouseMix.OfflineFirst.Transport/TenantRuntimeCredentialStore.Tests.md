# Tenant runtime credential vault verification

## Required Windows integration checks

1. Save and reload a runtime credential as the same Windows user.
2. A different Windows user cannot decrypt the DPAPI CurrentUser blob.
3. A store initialized with another tenant UUID cannot decrypt the original tenant blob (tenant-specific DPAPI entropy).
4. Saving a credential whose TenantId differs from the store tenant is rejected.
5. Invalid database keys, role names, and low-entropy passwords are rejected before persistence.
6. Replacing a credential writes an encrypted temporary file and atomically replaces the prior blob.
7. Deleting a credential removes the encrypted file; this is logical deletion, not a guarantee of forensic erasure on SSD/backup media.
8. No plaintext password, connection string, or token is written to logs or workspace metadata.

## Isolation boundary

The encrypted file is stored under the selected client's `credentials` workspace directory. DPAPI CurrentUser protects it from other Windows accounts, and tenant-specific optional entropy prevents accidental cross-tenant file reuse. Processes running as the same Windows account remain within the same OS trust boundary; DPAPI is not a sandbox against another process running as that same account. Each radio must continue to use its own Windows client workspace and database mapping.
