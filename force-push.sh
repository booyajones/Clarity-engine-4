#!/bin/bash

echo "🚀 Force pushing to GitHub..."
echo "This will override the remote repository with your local version."

# Set up the remote URL without authentication first
git remote set-url origin https://github.com/booyajones/Clarity-engine-4.git

# Create a new branch as backup
git branch backup-$(date +%Y%m%d-%H%M%S) 2>/dev/null

# Force push to main
echo "Pushing your 190 commits to GitHub..."
git push origin main --force 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to GitHub!"
    echo "Your code is now at: https://github.com/booyajones/Clarity-engine-4"
else
    echo "❌ Push failed. Trying alternative method..."
    # Try pushing to a new branch instead
    BRANCH_NAME="main-$(date +%Y%m%d)"
    git push origin main:$BRANCH_NAME --force 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ Pushed to new branch: $BRANCH_NAME"
        echo "You can set this as your default branch on GitHub"
    else
        echo "Authentication required. Please use the Git pane in Replit."
    fi
fi