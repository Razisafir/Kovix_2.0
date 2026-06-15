# KOVIX: Import signing certificate from base64 secret for GitHub Actions
# Replaces ESRP auth cert import with self-managed PFX certificate
#
# Usage:
#   ./import-signing-cert.ps1 -CertBase64 <base64-encoded PFX> -CertPassword <PFX password>
#
# Required env vars (set by GitHub Actions from Secrets):
#   - CertBase64: Base64-encoded PFX certificate (from KOVIX_SIGN_CERT_B64 secret)
#   - CertPassword: PFX password (from KOVIX_SIGN_CERT_PASSWORD secret)

param(
    [Parameter(Mandatory=$true)]
    [string]$CertBase64,

    [Parameter(Mandatory=$true)]
    [string]$CertPassword
)

$ErrorActionPreference = "Stop"

# Decode base64 to byte array
$CertBytes = [System.Convert]::FromBase64String($CertBase64)

# Import certificate collection with private key, persisted in LocalMachine store
$CertCollection = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
$CertCollection.Import(
    $CertBytes,
    $CertPassword,
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::MachineKeySet -bxor
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::PersistKeySet -bxor
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
)

# Open LocalMachine\My (Personal) store for signtool access
$CertStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("My", "LocalMachine")
$CertStore.Open("ReadWrite")
$CertStore.AddRange($CertCollection)
$CertStore.Close()

# Output cert subject and thumbprint for downstream use
$CertSubject = $CertCollection[0].Subject
$CertThumbprint = $CertCollection[0].Thumbprint

Write-Output "Imported certificate: $CertSubject"
Write-Output "Thumbprint: $CertThumbprint"

# Set environment variables for downstream signing steps
Write-Output ("::set-env name=KOVIX_SIGN_IDENTITY::$CertThumbprint")
Write-Output ("::set-output name=certSubject::$CertSubject")
Write-Output ("::set-output name=certThumbprint::$CertThumbprint")
