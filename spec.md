You see here a vue+vite+ts framework.
I want to build a basic cognitive load testing app.

Stack-wise, we need:
- LATEST!!! tailwind + daisy. Actually use the components, keep manual css to a minimum
- Use dexie, compatible with dexie-cloud (although don't implement dexie cloud yet). Actually research how to, don't just guess
- install eslint and get in the habit of running lint
- use vue router
- install lucide icon package and utiliz

## Tracking

In general, we need very detailled, comprehensive and solid tracking of user interactions.
tracking should always work via dexie.
When in doubt, track in more detail so we can later run analyses

## Components

### Header

simply link to the main view in a global header; on mobile, reduce buttons to icons. No hamburger.

## Views

### Main View

The core of the app.
The user gets exposed to random (yes, RANDOM) addition exercises such as "345 + 78".
Generation starts from single digit addition (4 + 7) to double four digit addition (5464 + 1222) with everything inbetween (345 + 1001).

There should be NO clutter on the main view, just the exercise (BIG!!!) (no prompt, no explanation, just the fucking exercise) and a BIG!! input field.
hook into inputs of the input field, as soon as the content of the input field is correct, generate the next exercise.

The only other thing: Add the top, have a toggle serious mode/trial mode. 
Trial mode is the default.
When toggled to serious mode, we get a fullscreen "3-2-1" and then we start with a newly generated exercsie.
When toggling back, the currently active task is then also marked "non-serious" in the log.
Also show the current user (see below) at the top of the UI.

Timestamp and log everything; every keystroke, when the user focuses/defocuses the tab, when new exercsie is shown, when it is solved, which exercise, etc, etc, which mode which tasks was done in, all.

Sometimes, randomly, after the exercise is solved, instead show the user a quick ui for evaluation:
Orient yourself by:

```
Paas’ Cognitive Load Rating Scale (Paas, 1992):

Single question: “How much mental effort did you invest in this task?”

Rated on a 9-point Likert scale (1 = very, very low effort, 9 = very, very high effort).
```

however, randomly vary and instead of "this task" put in "the last exercise" "the last three exercises", "the last five exercises", "the last 10 exercises".
Again ofc timestamp and log that in all needed detail. 


### Settings View

Tracking is hooked to a "user".
A user is nothing more than a string, but if none if set, auto redirect from main view to settings view.

there, show a list of existing users (which can be selected) or a text input to add more


### Logs

Show a nice card-based view of the last 100 exercises or so, with interesting key data.