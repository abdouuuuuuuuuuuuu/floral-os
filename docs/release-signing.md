# Code-signing the Windows installer

Today the installer is unsigned. Windows SmartScreen shows "Windows protected
your PC" on every install and on manual updates, and electron-updater cannot
check that an update really came from you.

## What you need to buy

A **code-signing certificate** in your name (individual) or your shop's name
(organisation). Since June 2023 the private key must live on hardware: either a
USB token mailed to you, or a cloud signing service. There is no longer a plain
`.pfx` file to drop into the project.

Options that work from Algeria (check current prices and identity requirements
with each vendor before paying):

| Option | Key storage | Notes |
| --- | --- | --- |
| Certum (Open Source / Standard code signing) | Cloud (SimplySign) or card | Accepts individuals; usually the cheapest |
| SSL.com (OV / EV) | Cloud (eSigner) | Signs from the command line, no token to carry |
| Sectigo / DigiCert resellers (OV / EV) | USB token or cloud | EV removes SmartScreen warnings fastest |

Microsoft's Trusted/Artifact Signing service is cheaper, but at the time of
writing it is only offered to organisations and individuals in a few countries
(US, Canada, EU, UK). Check whether Algeria has been added.

OV certificates build SmartScreen reputation over a few hundred installs; EV
certificates are trusted straight away but cost more.

## Wiring it into the build (once you have the certificate)

electron-builder signs every `.exe` it produces when told how. Two ways:

**USB token (signtool on this PC)**. Plug in the token, then in `package.json`:

```json
"win": {
  "target": "nsis",
  "icon": "public/icon.ico",
  "signtoolOptions": {
    "certificateSubjectName": "EXACT NAME ON YOUR CERTIFICATE",
    "publisherName": "EXACT NAME ON YOUR CERTIFICATE",
    "signingHashAlgorithms": ["sha256"],
    "rfc3161TimeStampServer": "http://timestamp.digicert.com"
  }
}
```

**Cloud signing (SSL.com eSigner, Certum SimplySign…)**. Use the vendor's
command-line signer from a small hook script:

```json
"win": {
  "signtoolOptions": {
    "publisherName": "EXACT NAME ON YOUR CERTIFICATE",
    "sign": "./scripts/sign-windows.cjs"
  }
}
```

`scripts/sign-windows.cjs` exports `async (configuration) => { ... }` and runs
the vendor's CLI on `configuration.path`. Each vendor documents the exact
command. Keep their username, password and TOTP secret in environment
variables, never in the repository.

`publisherName` matters: once it is set and the installed app is signed,
electron-updater refuses an update whose signature does not match, so a
tampered download can never be installed on the tills.

## Check a signed build

```powershell
Get-AuthenticodeSignature "release\Blossom-POS-Setup-<version>.exe" | Format-List Status, SignerCertificate
```

`Status` must be `Valid`.
