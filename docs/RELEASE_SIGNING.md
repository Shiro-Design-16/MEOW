# MEOW release signing

The release workflow refuses to publish artifacts unless both Apple and Windows signing credentials are configured. This prevents a new unsigned release from being created accidentally.

## macOS

Direct distribution outside the Mac App Store requires a paid Apple Developer account, a `Developer ID Application` certificate, and Apple notarization.

Export the certificate and its private key from Keychain Access as a password-protected `.p12`, then encode it without line breaks:

```sh
openssl base64 -A -in DeveloperIDApplication.p12 -out certificate-base64.txt
```

Add these GitHub Actions repository secrets:

- `APPLE_CERTIFICATE`: contents of `certificate-base64.txt`
- `APPLE_CERTIFICATE_PASSWORD`: password used when exporting the `.p12`
- `APPLE_ID`: Apple Developer account email
- `APPLE_PASSWORD`: an app-specific password, not the normal Apple ID password
- `APPLE_TEAM_ID`: the 10-character Apple Developer Team ID

The workflow imports the certificate into an isolated temporary keychain, signs the app, submits it for notarization through Tauri, staples the ticket, and verifies both the app signature and the DMG ticket before uploading anything.

## Windows

Obtain an Authenticode code-signing certificate that can be exported as a password-protected `.pfx`. Encode the `.pfx` as base64 and add these repository secrets:

- `WINDOWS_CERTIFICATE`: base64-encoded `.pfx` contents
- `WINDOWS_CERTIFICATE_PASSWORD`: `.pfx` export password

The workflow imports the certificate into the runner's current-user certificate store, passes its thumbprint to Tauri, applies a SHA-256 signature with a trusted timestamp, and verifies both `meow.exe` and the NSIS installer before uploading them.

An ordinary organization-validated certificate establishes publisher identity, but Microsoft SmartScreen reputation can still take time to accumulate. An EV certificate or Microsoft Trusted Signing can provide a stronger first-download experience if MEOW later adopts either service.

## Existing MEOW 0.0.1 artifacts

The files already attached to MEOW 0.0.1 were built before this enforcement was added and remain unsigned. Replace them only after all seven secrets above are configured and a signed rebuild has passed the verification steps.
