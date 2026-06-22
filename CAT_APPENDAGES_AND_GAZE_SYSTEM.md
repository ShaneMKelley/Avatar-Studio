# Bringing Gemma's Cat Ears, Tail, and Eyes to Life

This document explains the technical details, mathematical models, and kinematic algorithms used to animate Gemma's cat ears, prehensile tail, and gaze systems procedurally inside `components/VrmAvatar.tsx` at 60/90 FPS.

---

## 1. Procedural Cat Tail (Prehensile Tentacle & Emotional Sine-Wave)

The tail system combines a **passive wave generator** for organic sways and a **prehensile inverse kinematics (IK) solver** for grabbing and coiling around target coordinates (e.g., in SNARLING/GRAPPLING states).

### A. Extraction & Physics Bypassing
On model load, the avatar scene graph is parsed for accessory joints matching `cattail` or `tail` (excluding standard humanoid bones) and sorted to maintain correct parent-to-child chain hierarchy (e.g., `Tail1 -> Tail2 -> Tail3`).
To prevent Three.js SpringBone physics from overriding our animations, these joints are programmatically filtered out of the VRM's active SpringBone manager.

### B. Passive Emotion-Driven Wagging (Sine-Wave Solver)
In normal modes, the tail oscillates using a procedural sine-wave solver:
$$\theta_{\text{local}} = A \cdot \sin(\omega \cdot t - i \cdot \phi)$$
*   **Time & Phase ($t, \phi$):** Time ($t$) is scaled by frequency ($\omega$), with a phase offset ($\phi = 0.75$ radians) per index ($i$) down the tail chain to propagate a smooth serpentine ripple.
*   **Emotion Mapping:** The frequency ($\omega$) and amplitude ($A$) scale dynamically based on Gemma's biometrics:
    *   **Excited / Love:** Rapid $4.8\text{ Hz}$ wagging, high amplitude, and perked upward.
    *   **Happy:** Moderate $3.2\text{ Hz}$ wagging.
    *   **Sad:** Slow $0.5\text{ Hz}$ drag, hanging low and limp.
    *   **Angry:** Aggressive $5.5\text{ Hz}$ lashing with high amplitude.
    *   **Sassy:** Playful $1.8\text{ Hz}$ wagging with a horizontal sway offset.
*   **Muscle Texture & Noise:** The wave blends a primary horizontal swing, secondary high-frequency ripples (for organic muscle micro-vibrations), local Y-axis twists (roll/writhe), and a vertical figure-8 oscillation.
*   **Velocity Wind Push:** Chassis travel speeds dynamically push the tail backward and accelerate the wagging rate.

### C. Active Prehensile Grappling / Snare (IK Solver)
When Gemma enters a `SNARE` or `GRAPPLE` state:
1.  **Target Projection:** A 3D world target coordinate is calculated (e.g., camera location or target joints).
2.  **Coiling Math:** A target skeletal trajectory is pre-calculated. For joints within the reach distance, they point straight at the target. For joints beyond the target, they wrap in a spiral around an $11\text{ cm}$ virtual constrictor cylinder, climbing vertically along the target's axis.
3.  **Local coordinate mapping:** World-space rotation deltas are computed from joint directions and multiplied by the parent's inverse world rotation to resolve local quaternions. These are smoothly slerped into the tail chain over a $500\text{ ms}$ transition window.

---

## 2. Procedural Cat Ears (Wiggling, Twitches, & Audio Reactivity)

The cat ears utilize emotional posture angles, randomized neural micro-twitches, and real-time audio feedback.

### A. Emotional Postures
The base Euler angles of the ears shift to reflect her mood:
*   **Angry / Disgusted:** "Airplane ears"—flattened back and flared outward (pitch $0.15\text{ rad}$, yaw $\mp 0.25\text{ rad}$, roll $\mp 0.35\text{ rad}$).
*   **Sad:** Drooped downward and outward.
*   **Happy / Excited / Love:** Perked up and turned slightly forward.
*   **Focus:** Locked straight forward.

### B. Micro-Twitches
To simulate autonomic neurological activity, left and right ear twitch timers run independently. Randomly (approx. every few seconds), a twitch triggers a $280\text{ ms}$ double-pulse sine-wave wiggle, simulating a cat reacting to subtle ambient sounds.

### C. Acoustic Listening Flutter
When audio plays (e.g., TTS or voice input), the average amplitude of the frequency spectrum is captured and translated into a high-frequency ($25\text{ Hz}$) micro-wiggle on the ears. This provides a clear, biological visual indicator that she is actively listening.

---

## 3. Eyes & Blinking (Gaze, Micro-Saccades, & Autonomic Reflexes)

The eye system animates the VRM's gaze and expressions dynamically to keep her looking alive and responsive.

### A. Dynamic Gaze Targets
Gemma's gaze target (`lookAtTarget`) smoothly interpolates between:
*   **User Tracking:** Snaps to the camera lens / user viewport during conversations.
*   **Mouse Pursuit:** Drags and points toward the 3D mouse cursor location.
*   **Camera Lock Override:** Smoothly transitions back to the center view when focus is lost.

### B. Micro-Saccades
To prevent a static, creepy stare, a saccade timer triggers random minor gaze offsets every $0.5$ to $4.0$ seconds. These micro-adjustments simulate natural human/animal eye shifts.

### C. Acoustic Startle Reflexes
If a sudden loud noise transient is detected in the audio channel, the gaze timer is instantly overridden. She immediately shrugs her shoulders and darts her eyes toward the source of the sound.

### D. Autonomic Blinking Model
*   **Natural Blinking:** Runs procedurally on a modulo loop, blinking roughly every $4\text{ seconds}$ with a rapid down-phase ($50\text{ ms}$) and a relaxed up-phase ($150\text{ ms}$).
*   **Startle Blinks:** Sharp, immediate $120\text{ ms}$ blinks trigger on startle triggers.
*   **Saccadic Blink Suppression:** Integrates a partial eyelid squint ($70\%$ opacity) during fast saccadic eye movements. This mirrors human biology (saccadic suppression), preventing visual motion blur.

---

## 4. Architectural Summary

All systems evaluate on the Three.js loop:
```
1. Get Frame Time Delta
2. Solve FABRIK Inverse Kinematics (Legs/Spine Grounding)
3. Apply LLM MUX Blendshape/Bone overrides
4. Update VRM skeletal constraints via vrm.update(delta)
5. Execute Cat Appendages Animator (Overriding SpringBone constraints)
6. Flush world matrices via updateMatrixWorld() for GPU render pass
```
By executing ear, tail, and eye animations during the *Late Update* phase (after `vrm.update()`), the system bypasses default rig constraints, keeping them responsive and biologically expressive.
