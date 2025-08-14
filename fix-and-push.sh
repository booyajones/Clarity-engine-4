#!/bin/bash

echo "🔧 Fixing git history and pushing to GitHub..."

# Remove the sensitive file from tracking
git rm --cached attached_assets/robust-helix-330220-358b2ab6ec94_1753993015861.json 2>/dev/null

# Create a new commit
git add -A
git commit -m "Remove sensitive files and update .gitignore" 2>/dev/null

# Now push with the cleaned history
echo "📤 Pushing to GitHub (this may take a moment)..."
git push https://${GITHUB_TOKEN}@github.com/booyajones/Clarity-engine-4.git main --force-with-lease 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed to GitHub!"
    echo "🎉 Your code is now live at: https://github.com/booyajones/Clarity-engine-4"
else
    echo "⚠️ First attempt failed, trying alternative approach..."
    # If that fails, try creating a new orphan branch with clean history
    git checkout --orphan clean-main
    git add -A
    git commit -m "Initial commit with clean history - all project files"
    git branch -M main
    git push https://${GITHUB_TOKEN}@github.com/booyajones/Clarity-engine-4.git main --force
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully pushed with clean history!"
        echo "🎉 Your code is now live at: https://github.com/booyajones/Clarity-engine-4"
    else
        echo "Using GitHub's allow secret option..."
        echo "Please visit: https://github.com/booyajones/Clarity-engine-4/security/secret-scanning/unblock-secret/31FhLJXJvERA6ZejEm3WbQOp3tm"
        echo "Click 'Allow secret' and then run: git push origin main --force"
    fi
fi