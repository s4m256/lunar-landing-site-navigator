# English mission script

> Historical guided experience. The active entry point is now the [minimal comparison explorer](minimal-comparison.md).
Short, casual dialogue for the existing fictional guide, Lua. CLPS remains explicitly robotic. The application imports these lines from `frontend/src/mission/mission-copy.ts`.

## Briefing

1. Hi, I'm Lua, your fictional guide. CLPS missions are robotic—there are no astronauts on board.

2. NASA hires companies to deliver science equipment to the Moon. We're here to help choose where to land.

3. A solar-powered lander needs sunlight. To send data straight to Earth, it also needs a clear line of sight. Let's explore.

## At the Moon

1. We'll check the centers of the Sun and Earth against a level horizon. For now, mountains and shadows aren't included.

2. Pick a point on the Moon. Then try another place or date and see how the directions change.

## After selecting a qualifying site

Nice! Both centers are above the horizon at this site and time. A real mission would still need terrain, power, and radio checks.

## Controls

- **Back** returns to the previous line. It is disabled on the first briefing line. From the first arrival line, it returns to the last briefing line without a reverse flight.
- **Continue** reveals a line while it is typing. Once the line is complete, it advances. Labels remain stable.
- With reduced motion, text is complete immediately and Continue advances in one click.
- There are exactly two conversation buttons, no dialogue box, and no voice controls.
- The final Back and Continue controls return to the map, preserving the selected site and date.

## Scientific wording

The map compares body centers against an idealized tangent horizon at sampled UTC times. It does not calculate mountain obstruction, shadows, generated power, radio performance, or landing safety. The visible Moon relief is an approximate context layer, not the chosen site’s simulated illumination. These limits remain available in About and alongside the analysis.
