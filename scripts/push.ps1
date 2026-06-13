param([string]$Message = "update")
git add -A
git commit -m $Message
git push
