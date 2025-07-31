# Mastercard API Setup Guide

## What We Have:
✓ **Consumer Key**: `8Mg4p8h-0kO7rNwUlRfWhRyvQlzRphvEEujbNW8yabd509dd!e334d994fc924ed6bba81a28ae90399f0000000000000000`
✓ **P12 Certificate File**: `finexio2-production.p12`

## What We Need:
✗ **P12 Certificate Password**: The password you set when downloading/creating the certificate

## Understanding the Credentials:

### The KEY and PWD you provided:
- KEY: wuidhqwuie327476357cgqjhdg26t
- PWD: vnvjfjh737847635h5h3

These don't appear to be the P12 certificate password. 

### What is the P12 Certificate Password?
When you downloaded the certificate from Mastercard Developers:
1. You were asked to set a password for the certificate
2. This password protects the private key inside the P12 file
3. It's different from your Mastercard account password
4. It's specific to this P12 file

## Where to Find It:
1. Check your notes from when you downloaded the certificate
2. Look in your password manager
3. Check any documentation from when you set up the Mastercard project
4. Common patterns: "keystorepassword", your company name + numbers, etc.

## Alternative Solution:
If you can't find the P12 password, you can:
1. Go back to Mastercard Developers
2. Generate a new certificate with a known password
3. Download the new P12 file
4. Provide the new file and password