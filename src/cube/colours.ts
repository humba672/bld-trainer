/**
 * The colour scheme, in one place.
 *
 * Which colour sits on which face is a fact about the cube, not about any one screen, and it is
 * needed for more than painting: telling you which way to hold the cube means naming the colours
 * you would be looking at. Western scheme, white opposite yellow with green, red, blue, orange
 * round the middle - the same as every GAN ships with.
 */

import type { Face } from './cube';

export const COLOUR_HEX: Record<Face, string> = {
  U: '#f7f7f7',
  R: '#e03a3a',
  F: '#2fb14a',
  D: '#f2d02c',
  L: '#f08c2e',
  B: '#2b6fe0',
};

export const COLOUR_NAME: Record<Face, string> = {
  U: 'white',
  R: 'red',
  F: 'green',
  D: 'yellow',
  L: 'orange',
  B: 'blue',
};

/** Grey, for when showing the colours would give the answer away. */
export const BLANK_HEX = '#3a4150';
