---
title: "A small place to think"
date: "September 10, 2026"
reading: "3 min read"
description: "Why I am keeping this notebook public, unfinished, and a little bit messy."
tags: meta, writing
---

## The point is to keep going

This is the first note in a small public notebook. It is a place for ideas that are still becoming ideas: things I am learning, questions I cannot shake, and experiments that might go nowhere.

Writing here should feel closer to a workbench than a showroom. Some notes will be polished. Others will contain a rough edge or two. That is part of the record.

> The best notes do not just preserve an answer. They preserve the shape of the question.

## A little math

For example, a useful reminder from probability is Bayes' theorem:

$$
P(A \mid B) = \frac{P(B \mid A)P(A)}{P(B)}
$$

The notation is compact, but the habit behind it is expansive: update what you believe when new evidence arrives.

## A little code

Here is the kind of small experiment that belongs here:

```js
const notes = ["questions", "experiments", "answers"];

const nextNote = notes.at(Math.floor(Math.random() * notes.length));
console.log(`Today I am writing about ${nextNote}.`);
```

More notes will arrive in `posts/`. Add an image with a normal Markdown path, such as `![A caption](images/my-image.jpg)`, and it will appear inline with the writing.