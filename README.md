# College Project

# How to use GIT Commands in Terminal

A normal work flow is:
1. Before start your daily work, a good habit is to do a `git pull` to get lastest changes from the team
```
git pull --rebase # The rebase means to merge others' changes and put your changes on top of their changes
```
2.  You start working on the projec and making changes, after done, commit your changes
```
git add . # the `.` means add all changed file to the commit
git commit -m "message"  # The commit message is better to be meaningful, not just `1` or `some changes`
```
3.  Now you changes are safely committed to your local git server, but you need to push it to GitHub repo
```
git push
```

Done!
