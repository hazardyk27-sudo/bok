import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  ROULETTE_ASSET_PATH,
  ROULETTE_AUTHORITATIVE_SCALE,
  ROULETTE_BALL_RADIUS,
  ROULETTE_DARK_RACE_CHANNEL_PROFILE,
  ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS,
  ROULETTE_DARK_RACE_INNER_CONTAINMENT_RADIUS,
  ROULETTE_DARK_RACE_LAUNCH_RADIUS,
  ROULETTE_DARK_RACE_RADIUS_BAND,
  ROULETTE_DARK_RACE_WOOD_INNER_RADIUS,
  ROULETTE_EUROPEAN_SEQUENCE,
  ROULETTE_FIXED_TIMESTEP,
  ROULETTE_GRAVITY_Y,
  ROULETTE_MAX_CCD_SUBSTEPS,
  ROULETTE_NORMALIZED_DIAMETER,
  ROULETTE_POCKET_COUNT,
  ROULETTE_POCKET_FLOOR_OUTER_RADIUS,
  ROULETTE_POCKET_FLOOR_Y,
  ROULETTE_POCKET_OUTER_LIP_RADIUS,
  ROULETTE_POCKET_OUTER_LIP_Y,
  ROULETTE_RAW_SOURCE_CENTER,
  ROULETTE_ROTATION_AXIS,
  ROULETTE_ROTOR_ANGULAR_SPEED,
  ROULETTE_WORLD_UNITS_PER_METER,
  ROULETTE_Y_ORIGIN,
} from './roulette-scene-config';

const ROULETTE_RUNTIME_ASSET_PATH =
  import.meta.env.BASE_URL.replace(/\/?$/, '/') +
  ROULETTE_ASSET_PATH.split('/').at(-1)!;
const FIXED_TIMESTEP = ROULETTE_FIXED_TIMESTEP;
const TEST_ANGULAR_SPEED = ROULETTE_ROTOR_ANGULAR_SPEED;
const GRAVITY_Y = ROULETTE_GRAVITY_Y;
const BALL_RADIUS = ROULETTE_BALL_RADIUS;
const BALL_MASS = 0.0027;
const TWO_PI = Math.PI * 2;
const DROP_RADIUS = 2.35;
const DROP_HEIGHT_ABOVE_SURFACE = 0.72;
const DROP_DURATION_SECONDS = 4;
const DARK_OUTER_TRACK_RADIUS = 2.35;
const DARK_OUTER_TRACK_HEIGHT = -0.338;
const PART3_TRACK_FRICTION = 0.08;
const PART3_TRACK_DAMPING = 0.01;
const PART3_TRACK_DURATION_SECONDS = 30;
const PART3_OUTER_SPIN_TRACK_FRICTION = 0.028;
const PART3_OUTER_SPIN_LINEAR_DAMPING = 0.01;
const PART3_OUTER_SPIN_ANGULAR_DAMPING = 0.01;
const PART6_LAUNCH_SPEED_METERS_PER_SECOND_BASE = 5.0;
const PART6_LAUNCH_SPEED_METERS_PER_SECOND_VARIATION = 0.15;
const PART6_LAUNCH_SPEED_BASE =
  PART6_LAUNCH_SPEED_METERS_PER_SECOND_BASE *
  ROULETTE_WORLD_UNITS_PER_METER;
const PART6_LAUNCH_SPEED_VARIATION =
  PART6_LAUNCH_SPEED_METERS_PER_SECOND_VARIATION *
  ROULETTE_WORLD_UNITS_PER_METER;
const PART6_BALL_SPIN_FACTOR = 1.0;
const PART3_OUTER_SPIN_DURATION_SECONDS = 14.0;
const PART3_OUTER_SPIN_RUNS = [
  { id: 'outer-spin-low', label: 'Outer spin · low launch variation', speed: 4.85 },
  { id: 'outer-spin-nominal', label: 'Outer spin · nominal launch', speed: 5.0 },
  { id: 'outer-spin-high', label: 'Outer spin · high launch variation', speed: 5.15 },
] as const;
const PART6_TELEMETRY_SCHEMA_VERSION = 'roulette-part6-full-spin-telemetry-v1';
const PART6_FULL_SPIN_MAX_DURATION_SECONDS = 30;
const PART6_SETTLE_DURATION_SECONDS = 0.5;
const PART6_UI_YIELD_STEPS = 240;
const PART6_INTERACTIVE_YIELD_STEPS = 30;
const PART6_DIAGNOSTIC_YIELD_STEPS = 60;
const PART6_DIAGNOSTIC_PROGRESS_STEPS = 20;
const PART6_STATE_RESET_VECTOR_EPSILON = 0.0005;
const PART6_STATE_RESET_ANGLE_EPSILON = 0.00001;
const PART6_TRANSITION_HOVER_GRACE_SECONDS = 0.25;
const PART6_DETERMINISTIC_SEEDS = [
  61001, 61002, 61003, 61004, 61005,
  61006, 61007, 61008, 61009, 61010,
  61011, 61012, 61013, 61014, 61015,
  61016, 61017, 61018, 61019, 61020,
  61021, 61022, 61023, 61024, 61025,
  61026, 61027, 61028, 61029, 61030,
] as const;

function part6DeterministicUnit(seed: number, salt: number) {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

const PART6_FULL_SPIN_RUNS = PART6_DETERMINISTIC_SEEDS.map((seed, index) => ({
  id: 'part6-seed-' + String(seed),
  label: 'PART 6 deterministic spin ' + String(index + 1),
  seed,
  speed:
    PART6_LAUNCH_SPEED_BASE +
    (part6DeterministicUnit(seed, 1) * 2 - 1) *
      PART6_LAUNCH_SPEED_VARIATION,
  launchAzimuth: part6DeterministicUnit(seed, 2) * TWO_PI,
  rotorStartAngle: part6DeterministicUnit(seed, 3) * TWO_PI,
}));
const PART2_ACTUAL_DARK_TRACK_RADIUS_BAND = ROULETTE_DARK_RACE_RADIUS_BAND;
const PART2_ACTUAL_TRACK_CENTER_RADIUS_BAND: readonly [number, number] = [
  PART2_ACTUAL_DARK_TRACK_RADIUS_BAND[0] + BALL_RADIUS,
  PART2_ACTUAL_DARK_TRACK_RADIUS_BAND[1] - BALL_RADIUS,
];
const PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS =
  ROULETTE_DARK_RACE_LAUNCH_RADIUS;
const PART2_ACTUAL_WOOD_INNER_RADIUS =
  ROULETTE_DARK_RACE_WOOD_INNER_RADIUS;
const PART2_ACTUAL_INWARD_EDGE_RADIUS =
  ROULETTE_DARK_RACE_INWARD_EDGE_RADIUS;
const PART2_CHANNEL_PROFILE = ROULETTE_DARK_RACE_CHANNEL_PROFILE;
const PART2_COLLISION_CHANNEL_PROFILE: Array<[number, number]> = [
  ...PART2_CHANNEL_PROFILE
    .filter(([radius]) => radius <= 2.5)
    .map(([radius, y]) => [radius, y] as [number, number]),
  [2.520, -0.2820],
  [2.535, -0.2740],
  [2.545, -0.2630],
  [2.552, -0.2450],
  [2.556, -0.2100],
  [2.558, -0.1450],
  [2.559, -0.0400],
];
const PART2_INNER_CONTAINMENT_RADIUS =
  ROULETTE_DARK_RACE_INNER_CONTAINMENT_RADIUS;
const PART2_INNER_CONTAINMENT_CENTER_LIMIT =
  PART2_INNER_CONTAINMENT_RADIUS + BALL_RADIUS;
const PART2_CHANNEL_FLOOR_INNER_INDEX = 4;
const PART2_CHANNEL_FLOOR_OUTER_INDEX = 7;
const PART2_CHANNEL_OUTER_WALL_FOOT_INDEX = 7;
const PART2_CHANNEL_BOTTOM_THICKNESS = 0.12;
const PART3_LAUNCH_RADIUS = PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS;
const PART3_RETAINING_RIM_INNER_RADIUS = PART2_ACTUAL_WOOD_INNER_RADIUS;
const PART4_DEFLECTOR_SCAN_INNER_RADIUS =
  ROULETTE_POCKET_FLOOR_OUTER_RADIUS + 0.02;
const PART4_DEFLECTOR_SCAN_OUTER_RADIUS =
  ROULETTE_DARK_RACE_WOOD_INNER_RADIUS + 0.22;
const PART4_DEFLECTOR_RADIAL_SAMPLE_COUNT = 31;
const PART4_DEFLECTOR_AZIMUTH_SAMPLE_COUNT = 360;
const PART4_DEFLECTOR_MIN_PROMINENCE = 0.012;
const PART4_DEFLECTOR_MIN_CLUSTER_SAMPLES = 3;
const PART4_DEFLECTOR_MIN_COUNT = 4;
const PART4_DEFLECTOR_MAX_COUNT = 12;
const PART3_DEFLECTOR_FRICTION = 0.28;
const PART3_DEFLECTOR_RESTITUTION = 0.16;
const PART3_TRACK_INNER_RADIUS = PART2_ACTUAL_DARK_TRACK_RADIUS_BAND[0];
const PART3_TRACK_OUTER_RADIUS = PART2_ACTUAL_DARK_TRACK_RADIUS_BAND[1];
const PART3_TRACK_CONTACT_TOLERANCE = 0.1;
const PART3_OUTER_LANE_PROBE_DURATION_SECONDS = 1.2;
const PART3_OUTER_LANE_CLEARANCE_MARGIN = 0.02;
const PART3_DARK_TRACK_RADIUS_BAND = PART2_ACTUAL_DARK_TRACK_RADIUS_BAND;
const PART3_POCKET_PROBE_DURATION_SECONDS = 3.5;
const PART3_POCKET_PROBE_RADIUS = 1.62;
const PART3_ALIGNMENT_PROBE_DURATION_SECONDS = 0.9;
const PART3_ALIGNMENT_PROBE_SPEED = 0.42;
const PART3_POCKET_TARGET_INDEX = 0;
const PART3_POCKET_TRANSITION_RADIUS = 1.95;
const PART3_PREFIX_BLOCKING_COLLIDER_HANDLE = 0;
const PART3_PREFIX_BLOCKING_COLLIDER_TYPE = 'outer-track-support-trimesh';
const PART1_SIDE_TRACK_CONTACT_TOLERANCE = 0.006;
const PROFILE_SEGMENTS = 64;
const PROFILE_SHELL_THICKNESS = 0.08;
const BALL_COLLISION_GROUP = 0x0001;
const STATIONARY_COLLISION_GROUP = 0x0002;
const ROTOR_COLLISION_GROUP = 0x0004;
const ROTOR_CONTACT_RADIUS = 1.72;
const ROTOR_CONTACT_SEGMENTS = 32;
const EUROPEAN_POCKET_COUNT = ROULETTE_POCKET_COUNT;
const POCKET_STEP_RADIANS = TWO_PI / EUROPEAN_POCKET_COUNT;
const POCKET_FLOOR_INNER_RADIUS = 1.48;
const POCKET_FLOOR_OUTER_RADIUS = ROULETTE_POCKET_FLOOR_OUTER_RADIUS;
const POCKET_FLOOR_Y = ROULETTE_POCKET_FLOOR_Y;
const POCKET_OUTER_LIP_RADIUS = ROULETTE_POCKET_OUTER_LIP_RADIUS;
const POCKET_OUTER_LIP_Y = ROULETTE_POCKET_OUTER_LIP_Y;
const POCKET_FLOOR_THICKNESS = 0.06;
const POCKET_FLOOR_SEGMENTS = 74;
const BOWL_BRIDGE_INNER_RADIUS = POCKET_OUTER_LIP_RADIUS;
const BOWL_BRIDGE_OUTER_RADIUS = PART2_CHANNEL_PROFILE[0][0];
const BOWL_BRIDGE_SEGMENTS = 128;
const BOWL_BRIDGE_SAMPLE_COUNT = 9;
const BOWL_BRIDGE_THICKNESS = 0.08;
const POCKET_FRET_INNER_EDGE_RADIUS =
  POCKET_FLOOR_INNER_RADIUS + BALL_RADIUS * 2 + 0.0206689453125;
const POCKET_FRET_OUTER_EDGE_RADIUS = POCKET_FLOOR_OUTER_RADIUS - 0.02;
const POCKET_FRET_RADIUS =
  (POCKET_FRET_INNER_EDGE_RADIUS + POCKET_FRET_OUTER_EDGE_RADIUS) / 2;
const POCKET_FRET_TANGENTIAL_HALF_EXTENT = 0.03;
const POCKET_FRET_RADIAL_HALF_EXTENT =
  (POCKET_FRET_OUTER_EDGE_RADIUS - POCKET_FRET_INNER_EDGE_RADIUS) / 2;
const POCKET_FRET_VERTICAL_HALF_EXTENT = 0.11;
const POCKET_FRET_EDGE_ROUNDING = 0.005;
const POCKET_INNER_GUARD_EDGE_ROUNDING = 0.02;
// Keep the fret's lower face just above the continuous floor. Letting the
// separator extend through the floor creates a moving edge that can inject a
// downward impulse when a ball approaches from the side.
const POCKET_FRET_Y =
  POCKET_FLOOR_Y + POCKET_FRET_VERTICAL_HALF_EXTENT + 0.022;
const EUROPEAN_SEQUENCE = ROULETTE_EUROPEAN_SEQUENCE;

type InspectionView = 'top' | 'angled' | 'side';
type LoadState = 'loading' | 'loaded' | 'error';
type ValidationErrorKind =
  | 'asset'
  | 'geometry-audit'
  | 'physics-validation'
  | 'telemetry'
  | 'initialization';
type VectorReadout = { x: number; y: number; z: number };

type Part2AssetAudit = {
  sourceMeshCount: number;
  sourceTriangles: number;
  runtimeMeshCount: number;
  runtimeTriangles: number;
  normalizationScale: number;
  dimensions: VectorReadout;
  pivot: VectorReadout;
  sourcePivot: VectorReadout;
  sourceRoot: string;
  excludedGeometry: string[];
  attribution: { author: string; license: string; source: string };
  stationaryMeshCount: number;
  stationaryTriangles: number;
  rotorMeshCount: number;
  rotorTriangles: number;
};

type Part2DropReport = {
  status: 'running' | 'passed' | 'failed';
  initialPosition: VectorReadout;
  firstContactPosition: VectorReadout | null;
  firstContactRadius: number | null;
  firstContactTime: number | null;
  finalPosition: VectorReadout;
  finalSpeed: number;
  maxPenetration: number;
  finalSeparation: number;
  passThrough: boolean;
  visibleSurfaceMatch: boolean;
  ccdEnabled: boolean;
  maxVisualBodySyncError: number;
  colliderProfile: {
    outerTrackRadius: number;
    outerTrackHeight: number;
    bowlInnerRadius: number;
    bowlOuterRadius: number;
    innerFloorTop: number;
    centerGuardRadius: number;
  };
  detail: string;
};

type Part3ProbeResult = {
  id: string;
  label: string;
  spawnRadius: number;
  spawnHeight: number;
  initialVelocity: VectorReadout;
  initialAngularSpin: VectorReadout;
  lapCount: number;
  trackDuration: number;
  averageTrackSpeed: number;
  trackStartSpeed: number;
  trackEndSpeed: number;
  trackLapSpeeds: number[];
  energyLossRatio: number;
  continuousTrackContact: boolean;
  naturalRollOrSlide: boolean;
  inwardDescentTime: number | null;
  inwardDescentRadius: number | null;
  deflectorContact: boolean;
  peakSpeedBeforeContact: number | null;
  peakSpeedAfterContact: number | null;
  impactSpeedBefore: number | null;
  impactSpeedAfter: number | null;
  impactDirectionChangeDegrees: number | null;
  noPassThrough: boolean;
  visualContactAlignmentCredible: boolean;
  retainingRimRadius: number;
  nearestDeflectorRadius: number;
  earlyLapMinimumDeflectorClearance: number | null;
  deflectorColliderCount: number;
  deflectorColliderType: string;
  deflectorColliderFriction: number;
  deflectorColliderRestitution: number;
  bouncePlausible: boolean;
  hover: boolean;
  clipping: boolean;
  artificialAcceleration: boolean;
  maxRotorSyncError: number;
  peakSpeed: number;
  minRadius: number;
  maxRadius: number;
  maxPenetration: number;
  maxSeparation: number;
  stableContact: boolean;
  leftValidVolume: boolean;
  tunneling: boolean;
  velocityExplosion: boolean;
  maxVisualBodySyncError: number;
  outcome: 'stable' | 'settled' | 'failed';
  detail: string;
};

type Part3ValidationReport = {
  status: 'running' | 'passed' | 'failed';
  results: Part3ProbeResult[];
  pocketDescent: Part3PocketDescentReport | null;
  ccdEnabled: boolean;
  detail: string;
};

type Part3AlignmentReport = {
  status: 'running' | 'passed' | 'failed';
  sampleRadius: number;
  sampleAzimuth: number;
  darkTrackRadiusBand: readonly [number, number];
  visibleSurfaceY: number | null;
  visibleSurfaceSource: string | null;
  analyticColliderContactYBefore: number;
  analyticColliderContactYAfter: number;
  rigidBodyCenterY: number;
  ballBottomY: number;
  ballRadius: number;
  signedVerticalMismatch: number | null;
  signedColliderContactMismatch: number;
  woodRetainingRingContact: boolean;
  visuallyInsideWheelBody: boolean;
  physicalContact: boolean;
  hover: boolean;
  passThrough: boolean;
  tunneling: boolean;
  maxVisualBodySyncError: number;
  detail: string;
};

type Part3OuterLaneReport = {
  status: 'running' | 'passed' | 'failed';
  darkTrackInnerRadius: number;
  darkTrackOuterRadius: number;
  retainingRimInnerRadius: number;
  nearestDeflectorOuterRadius: number;
  ballRadius: number;
  chosenLaunchRadius: number;
  radialClearanceToRim: number;
  radialClearanceToDeflector: number;
  outerTrackEdgeClearance: number;
  launchAzimuth: number;
  launchHeight: number;
  tangentialLaunchDirection: VectorReadout;
  initialLinearSpeed: number;
  initialAngularSpin: VectorReadout;
  floorContactNormal: VectorReadout;
  outerWallContactNormal: VectorReadout;
  peakSpeed: number;
  inwardRadialDrift: number;
  minRadius: number;
  maxRadius: number;
  minRimClearance: number;
  minDeflectorClearance: number;
  innerContainmentRadius: number;
  innerContainmentCenterLimit: number;
  minimumInnerContainmentClearance: number;
  staysOnOuterDarkLane: boolean;
  prematureDeflectorContact: boolean;
  woodContact: boolean;
  hover: boolean;
  clipping: boolean;
  tunneling: boolean;
  escaped: boolean;
  velocitySpike: boolean;
  maxVisualBodySyncError: number;
  maxPenetration: number;
  maxSeparation: number;
  physicalTrackContact: boolean;
  detail: string;
};

type Part3OuterLaneSpinResult = {
  id: string;
  label: string;
  launchSpeed: number;
  initialAngularSpin: VectorReadout;
  lapCount: number;
  trackDuration: number;
  peakSpeed: number;
  averageTrackSpeed: number;
  endSpeed: number;
  speedTrendByLap: number[];
  minRadius: number;
  maxRadius: number;
  minimumRimClearance: number;
  minimumDeflectorClearance: number;
  continuousTrackContact: boolean;
  rollingOrSlidingCoherent: boolean;
  readyForInwardDescent: boolean;
  naturalInwardTransition: boolean;
  inwardTransitionTime: number | null;
  inwardTransitionRadius: number | null;
  woodContact: boolean;
  hover: boolean;
  clipping: boolean;
  tunneling: boolean;
  escaped: boolean;
  velocitySpike: boolean;
  artificialAcceleration: boolean;
  maxVisualBodySyncError: number;
  maxRotorSyncError: number;
  maxPenetration: number;
  maxSeparation: number;
  outcome: 'stable' | 'failed';
  detail: string;
};

type Part3OuterLaneSpinReport = {
  status: 'running' | 'passed' | 'failed';
  trackFriction: number;
  linearDamping: number;
  angularDamping: number;
  fixedTimestep: number;
  operationalLaunchRadius: number;
  launchHeight: number;
  ballRadius: number;
  results: Part3OuterLaneSpinResult[];
  detail: string;
};

type Part6SpinPhase =
  | 'OUTER_RACE'
  | 'INWARD_DESCENT'
  | 'DEFLECTOR_ZONE'
  | 'ROTOR_ENTRY'
  | 'FRETS'
  | 'POCKET'
  | 'SETTLED';

type Part6PhaseEvent = {
  phase: Part6SpinPhase;
  time: number;
  radius: number;
  y: number;
  speed: number;
  contactRole: string | null;
};

type Part6FullSpinTelemetryResult = {
  id: string;
  seed: number;
  label: string;
  launchAzimuth: number;
  launchSpeed: number;
  launchSpeedMetersPerSecond: number;
  launchRadius: number;
  launchHeight: number;
  rotorStartAngle: number;
  stateResetVerified: boolean;
  resetPositionError: number;
  resetVelocityError: number;
  resetAngularVelocityError: number;
  resetRotationError: number;
  resetRotorAngleError: number;
  elapsed: number;
  lapCount: number;
  trackDuration: number;
  trackContactRatio: number;
  trackStartSpeed: number;
  trackEndSpeed: number;
  peakSpeed: number;
  lapSpeeds: number[];
  speedDegradesAcrossLaps: boolean;
  outerLapTargetMet: boolean;
  minRadius: number;
  maxRadius: number;
  inwardTransitionTime: number | null;
  inwardTransitionRadius: number | null;
  phases: Part6PhaseEvent[];
  phaseSequenceValid: boolean;
  transitionMinRadius: number | null;
  transitionMaxRadius: number | null;
  transitionMinY: number | null;
  transitionMaxY: number | null;
  transitionMaxSurfacePenetration: number;
  transitionMaxSurfaceSeparation: number;
  transitionContactRoles: string[];
  maxUnsupportedTransitionDuration: number;
  rotorEntryTime: number | null;
  deflectorContactCount: number;
  firstDeflectorContactTime: number | null;
  impactSpeedBefore: number | null;
  impactSpeedAfter: number | null;
  impactDirectionChangeDegrees: number | null;
  fretContact: boolean;
  firstFretContactTime: number | null;
  pocketEntered: boolean;
  pocketEntryTime: number | null;
  settled: boolean;
  settleTime: number | null;
  finalPocketIndex: number | null;
  finalPocketNumber: number | null;
  finalSpeed: number;
  finalRotorRelativeSpeed: number;
  hover: boolean;
  clipping: boolean;
  tunneling: boolean;
  escaped: boolean;
  velocitySpike: boolean;
  artificialAcceleration: boolean;
  maxTrackPenetration: number;
  maxTrackSeparation: number;
  maxPocketFloorPenetration: number;
  maxPocketFloorSeparation: number;
  maxVisualBodySyncError: number;
  maxRotorSyncError: number;
  timedOut: boolean;
  safetyPassed: boolean;
  telemetryComplete: boolean;
  detail: string;
};

type Part6FullSpinTelemetryReport = {
  status: 'running' | 'captured' | 'failed';
  safetyStatus: 'pending' | 'passed' | 'failed';
  calibrationStatus: 'not-evaluated' | 'passed' | 'failed';
  schemaVersion: string;
  fixedTimestep: number;
  maxDurationSeconds: number;
  seedCount: number;
  completedCount: number;
  timedOutCount: number;
  phaseSequenceFailureCount: number;
  fourToFiveLapCount: number;
  inwardTransitionCount: number;
  deflectorContactCount: number;
  fretContactCount: number;
  pocketEntryCount: number;
  settledCount: number;
  safetyFailureCount: number;
  medianLapCount: number | null;
  minLapCount: number | null;
  maxLapCount: number | null;
  medianTrackContactRatio: number | null;
  inwardTransitionRate: number;
  deflectorContactRate: number;
  pocketEntryRate: number;
  settleRate: number;
  safetyFailureRate: number;
  trackFriction: number;
  linearDamping: number;
  angularDamping: number;
  results: Part6FullSpinTelemetryResult[];
  detail: string;
};

type Part2RacePlacementReport = {
  status: 'running' | 'passed' | 'failed';
  channelInnerRadius: number;
  channelOuterRadius: number;
  visibleInnerTransitionProfile: readonly [number, number][];
  visibleInnerSurfaceProfile: readonly [number, number][];
  analyticInnerTransitionProfile: readonly [number, number][];
  visibleOuterWallProfile: readonly [number, number][];
  analyticOuterWallProfile: readonly [number, number][];
  runningSurfaceYRange: readonly [number, number];
  runningSurfaceSlope: readonly [number, number];
  outerWallY: number;
  innerTransitionY: number;
  disabledColliders: string[];
  activeRaceCollider: string;
  spawnRadius: number;
  spawnHeight: number;
  contactNormal: VectorReadout;
  ballBottomContactPoint: VectorReadout;
  ballBottomContactRadius: number;
  ballBottomContactY: number;
  nearestFloorPoint: VectorReadout;
  nearestFloorRadius: number;
  nearestFloorY: number;
  centerFloorEnvelope: readonly [number, number];
  centerInsideFloorEnvelope: boolean;
  innerTransitionDistance: number;
  outerWallDistance: number;
  contactColliderHandle: number | null;
  contactColliderType: string;
  minRadius: number;
  maxRadius: number;
  physicalContact: boolean;
  visibleSurfaceMatch: boolean;
  numericPlacementPassed: boolean;
  visualGateVerified: boolean;
  onWoodTop: boolean;
  broadSupportActive: boolean;
  hover: boolean;
  detail: string;
};

type Part3GeometryProfileHit = {
  y: number;
  objectName: string;
  materialName: string;
  normalY: number;
};

type Part3GeometryProfileSample = {
  azimuth: number;
  radius: number;
  hits: Part3GeometryProfileHit[];
};

type Part4VisibleDeflector = {
  angle: number;
  angularWidth: number;
  innerRadius: number;
  outerRadius: number;
  bottomY: number;
  topY: number;
  peakProminence: number;
};

type Part4DeflectorAudit = {
  passed: boolean;
  descriptors: Part4VisibleDeflector[];
  prominenceThreshold: number;
  peakProminence: number;
  maxSpacingDeviationRatio: number | null;
  detail: string;
};

type Part3GeometryDiagnosticReport = {
  status: 'running' | 'passed' | 'failed';
  trueDarkTrackInnerRadius: number | null;
  trueDarkTrackOuterRadius: number | null;
  trueDarkTrackCenterRadius: number | null;
  darkTrackSurfaceYRange: readonly [number, number] | null;
  outerWoodRingRadiusBand: readonly [number, number] | null;
  nearestDeflectorRadiusBand: readonly [number, number] | null;
  visibleDeflectorCount: number | null;
  visibleDeflectorAnglesDegrees: number[];
  visibleDeflectorAuditPassed: boolean;
  proposedLaunchRadius: number | null;
  proposedLaunchHeight: number | null;
  ballRadius: number;
  rimClearance: number | null;
  deflectorClearance: number | null;
  staticVisibleContact: boolean;
  staticOnDarkTrack: boolean;
  staticOnWood: boolean;
  staticInsideWheel: boolean;
  staticHover: boolean;
  radialProfile: Part3GeometryProfileSample[];
  detail: string;
};

type Part3PocketDescentReport = {
  status: 'running' | 'passed' | 'failed';
  label: string;
  targetPocketIndex: number;
  targetPocketNumber: number;
  blockingColliderHandle: number | null;
  blockingColliderType: string | null;
  preFixBlockingColliderHandle: number | null;
  preFixBlockingColliderType: string | null;
  blockingColliderFirstContactTime: number | null;
  correctedTransitionRadius: number;
  pocketFloorIntegrated: boolean;
  fretColliderCount: number;
  enteredPocketVolume: boolean;
  fretContact: boolean;
  peakSpeedAtFretContact: number | null;
  maxPenetration: number;
  maxSeparation: number;
  settled: boolean;
  settledFrames: number;
  finalRadius: number;
  finalHeight: number;
  finalSpeed: number;
  finalRotorRelativeSpeed: number;
  finalPocketIndex: number | null;
  finalPocketNumber: number | null;
  escaped: boolean;
  tunneled: boolean;
  hover: boolean;
  velocityExplosion: boolean;
  artificialEnergyInjection: boolean;
  maxRotorSyncError: number;
  maxVisualBodySyncError: number;
  detail: string;
};

type Part4ProbeResult = {
  id: string;
  label: string;
  rotorAngularSpeed: number;
  contactDuration: number;
  spawnRadius: number;
  spawnHeight: number;
  initialVelocity: VectorReadout;
  peakSpeed: number;
  maxEnergyGain: number;
  minRadius: number;
  maxRadius: number;
  maxPenetration: number;
  maxSeparation: number;
  escaped: boolean;
  tunneling: boolean;
  velocityExplosion: boolean;
  maxVisualBodySyncError: number;
  maxRotorSyncError: number;
  outsideTurretStationary: boolean;
  outcome: 'stable' | 'settled' | 'failed';
  detail: string;
};

type Part4ValidationReport = {
  status: 'running' | 'passed' | 'failed';
  results: Part4ProbeResult[];
  ccdEnabled: boolean;
  kinematicRotor: boolean;
  detail: string;
};

type PocketEntryProbeResult = {
  id: string;
  label: string;
  kind: 'side-track' | 'bowl-contact' | 'pocket-aperture';
  sampleRadius: number | null;
  surfacePoint: VectorReadout | null;
  surfaceNormal: VectorReadout | null;
  ballCenterPosition: VectorReadout;
  targetPocketIndex: number | null;
  targetPocketNumber: number | null;
  rotorAngularSpeed: number;
  entryVelocity: VectorReadout;
  peakBallSpeed: number;
  maxPenetration: number;
  maxSeparation: number;
  fretContact: boolean;
  physicalContact: boolean;
  contactColliderType: string | null;
  artificialEnergyInjection: boolean;
  escaped: boolean;
  tunneled: boolean;
  settled: boolean;
  finalPocketIndex: number | null;
  finalPocketNumber: number | null;
  maxVisualBodySyncError: number;
  maxRotorSyncError: number;
  detail: string;
};

type PocketValidationReport = {
  status: 'running' | 'passed' | 'failed';
  results: PocketEntryProbeResult[];
  detail: string;
};

type Part2SceneViewportProps = {
  loadKey: number;
  validationMode?: 'part2' | 'part3' | 'part4';
  part1ProbeOnly?: boolean;
  alignmentOnly?: boolean;
  outerLaneOnly?: boolean;
  outerLaneSpinOnly?: boolean;
  geometryDiagnosticOnly?: boolean;
  view: InspectionView;
  showGrid: boolean;
  showPhysicsDebug: boolean;
  showBallPlaceholder: boolean;
  showStationaryGroup: boolean;
  showRotorGroup: boolean;
  rotorAngle: number;
  onStateChange: (
    state: LoadState,
    detail?: string,
    errorKind?: ValidationErrorKind,
  ) => void;
  onAudit: (audit: Part2AssetAudit) => void;
  onRotorAngleChange: (angle: number) => void;
};

const VIEW_PRESETS: Record<InspectionView, { position: [number, number, number]; up: [number, number, number] }> = {
  top: { position: [0, 9.4, 0.001], up: [0, 0, -1] },
  angled: { position: [5.8, 4.9, 6.6], up: [0, 1, 0] },
  side: { position: [6.8, 1.2, 0.001], up: [0, 1, 0] },
};

// This is a measured, low-complexity reconstruction of the visible LP Test 04
// profile. It is intentionally not the raw GLB triangle mesh.
const BOWL_PROFILE: Array<[number, number]> = [
  [0.32, -0.62],
  [0.75, -0.57],
  [1.25, -0.52],
  [1.65, -0.49],
  [1.95, -0.458],
  [2.10, -0.385],
  [2.25, -0.35],
  [2.35, -0.338],
  [2.40, -0.33],
  [2.50, -0.276],
  [2.60, -0.23],
  [2.75, -0.12],
  [2.90, -0.02],
  [3.00, 0.01],
];

const COLLIDER_PROFILE = {
  outerTrackRadius: DROP_RADIUS,
  outerTrackHeight: -0.338,
  bowlInnerRadius: BOWL_PROFILE[0][0],
  bowlOuterRadius: BOWL_PROFILE.at(-1)![0],
  innerFloorTop: -0.68,
  centerGuardRadius: 0.25,
};

const PART3_PROBES = [
  {
    id: 'outer-track-launch',
    label: 'Outer-track launch / deflector clearance',
    angle: 0.37,
    radius: PART3_LAUNCH_RADIUS,
    speed: 5,
    spinFactor: 1,
    kind: 'outer-track',
    durationSeconds: PART3_TRACK_DURATION_SECONDS,
  },
  {
    id: 'controlled-deflector-approach',
    label: 'Controlled inward deflector approach',
    angle: 0.37,
    radius: PART2_ACTUAL_INWARD_EDGE_RADIUS + BALL_RADIUS + 0.18,
    speed: 1.4,
    spinFactor: 0,
    kind: 'deflector-approach',
    durationSeconds: 2.5,
  },
] as const;

const PART4_PROBES = [
  {
    id: 'gentle-kinematic-contact',
    label: 'Gentle kinematic rotor contact',
    angle: 0.47,
    radius: ROTOR_CONTACT_RADIUS,
    relativeSpeed: 0.12,
    durationSeconds: 1.6,
  },
  {
    id: 'moderate-kinematic-contact',
    label: 'Moderate relative rotor contact',
    angle: 1.03,
    radius: ROTOR_CONTACT_RADIUS,
    relativeSpeed: 0.45,
    durationSeconds: 1.6,
  },
] as const;

const PART1_PROBES = [
  {
    id: 'real-side-track-placement',
    label: 'Real side-track placement',
    kind: 'side-track',
    angle: 0.37,
    radius: 2.39,
    durationSeconds: 0.15,
  },
  {
    id: 'bowl-contact',
    label: 'Bowl contact',
    kind: 'bowl-contact',
    angle: 0.37,
    radius: 2.05,
    durationSeconds: 0.65,
  },
  {
    id: 'pocket-aperture-access',
    label: 'Representative pocket-aperture access',
    kind: 'pocket-aperture',
    targetPocketIndex: 0,
    angularOffset: 0,
    tangentialSpeed: 0,
    radius: 1.62,
    durationSeconds: 3.5,
  },
] as const;

function part3SpawnPosition(
  probe: (typeof PART3_PROBES)[number],
  verticalOffset = 0,
  measuredDeflector: Part4VisibleDeflector | null = null,
) {
  if (probe.kind === 'deflector-approach') {
    const angle = measuredDeflector?.angle ?? probe.angle;
    const radius = measuredDeflector
      ? measuredDeflector.outerRadius + BALL_RADIUS + 0.16
      : probe.radius;
    const height = measuredDeflector
      ? (measuredDeflector.bottomY + measuredDeflector.topY) / 2
      : part2ChannelSurfaceAt(
          PART2_ACTUAL_INWARD_EDGE_RADIUS,
          verticalOffset,
        ).y + BALL_RADIUS;
    return radialPosition(radius, angle, height);
  }
  const surface = part2ChannelSurfaceAt(probe.radius, verticalOffset);
  const surfacePoint = new THREE.Vector3(
    ...radialPosition(probe.radius, probe.angle, surface.y),
  );
  return surfacePoint
    .addScaledVector(
      part2ChannelNormalAt(probe.radius, probe.angle),
      BALL_RADIUS + 0.002,
    )
    .toArray() as [number, number, number];
}

function part3InitialVelocity(
  probe: (typeof PART3_PROBES)[number],
  measuredAngle: number | null = null,
): VectorReadout {
  if (probe.kind === 'deflector-approach') {
    const angle = measuredAngle ?? probe.angle;
    return {
      x: Number((-Math.sin(angle) * probe.speed).toFixed(4)),
      y: 0,
      z: Number((-Math.cos(angle) * probe.speed).toFixed(4)),
    };
  }
  return {
    x: Number((Math.cos(probe.angle) * probe.speed).toFixed(4)),
    y: 0,
    z: Number((-Math.sin(probe.angle) * probe.speed).toFixed(4)),
  };
}

function part3TangentialVelocity(angle: number, speed: number): VectorReadout {
  return {
    x: Number((Math.cos(angle) * speed).toFixed(4)),
    y: 0,
    z: Number((-Math.sin(angle) * speed).toFixed(4)),
  };
}

function part3InitialAngularSpin(probe: (typeof PART3_PROBES)[number]): VectorReadout {
  if (probe.kind === 'deflector-approach') {
    return { x: 0, y: 0, z: 0 };
  }
  const velocity = part3TangentialVelocity(probe.angle, probe.speed);
  return {
    x: Number((velocity.z / BALL_RADIUS * probe.spinFactor).toFixed(4)),
    y: 0,
    z: Number((-velocity.x / BALL_RADIUS * probe.spinFactor).toFixed(4)),
  };
}

function addMeasuredDeflectorColliders(
  world: RAPIER.World,
  stationaryBody: RAPIER.RigidBody,
  descriptors: readonly Part4VisibleDeflector[],
) {
  const colliders: RAPIER.Collider[] = [];
  for (const descriptor of descriptors) {
    // The visual prominence scan can include the sloped apron outside the
    // actual inward edge. Never let the cuboid approximation protrude into
    // the validated outer race, where it can strike the ball at launch.
    const effectiveOuterRadius = Math.min(
      descriptor.outerRadius,
      PART2_ACTUAL_INWARD_EDGE_RADIUS,
    );
    const effectiveInnerRadius = Math.min(
      descriptor.innerRadius,
      effectiveOuterRadius - BALL_RADIUS * 0.5,
    );
    const centerRadius =
      (effectiveInnerRadius + effectiveOuterRadius) / 2;
    const halfRadialDepth = Math.max(
      BALL_RADIUS * 0.25,
      (effectiveOuterRadius - effectiveInnerRadius) / 2,
    );
    const halfHeight = Math.max(
      0.02,
      (descriptor.topY - descriptor.bottomY) / 2,
    );
    const centerY = (descriptor.bottomY + descriptor.topY) / 2;
    const halfTangentialWidth = THREE.MathUtils.clamp(
      centerRadius * descriptor.angularWidth * 0.5,
      BALL_RADIUS * 0.9,
      0.22,
    );
    const angle = descriptor.angle;
    // Model only the vertical sides of the measured deflector volume.
    // A capped box adds an artificial horizontal top shelf; high-speed balls
    // that only graze the measured prominence can then be launched upward.
    const deflectorVertices = new Float32Array([
      -halfTangentialWidth, -halfHeight, -halfRadialDepth,
       halfTangentialWidth, -halfHeight, -halfRadialDepth,
       halfTangentialWidth,  halfHeight, -halfRadialDepth,
      -halfTangentialWidth,  halfHeight, -halfRadialDepth,
      -halfTangentialWidth, -halfHeight,  halfRadialDepth,
       halfTangentialWidth, -halfHeight,  halfRadialDepth,
       halfTangentialWidth,  halfHeight,  halfRadialDepth,
      -halfTangentialWidth,  halfHeight,  halfRadialDepth,
    ]);
    const deflectorIndices = new Uint32Array([
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
    ]);
    const collider = RAPIER.ColliderDesc.trimesh(
      deflectorVertices,
      deflectorIndices,
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
    )
      .setTranslation(
        Math.sin(angle) * centerRadius,
        centerY,
        Math.cos(angle) * centerRadius,
      )
      .setRotation({
        x: 0,
        y: Math.sin(angle / 2),
        z: 0,
        w: Math.cos(angle / 2),
      })
      .setFriction(PART3_DEFLECTOR_FRICTION)
      .setRestitution(PART3_DEFLECTOR_RESTITUTION)
      .setCollisionGroups(
        STATIONARY_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
      );
    colliders.push(world.createCollider(collider, stationaryBody));
  }
  return colliders;
}

function part3TrackHeightBase(radius: number) {
  return part2ChannelSurfaceAt(radius).y;
}

function part3TrackHeight(radius: number, verticalOffset = 0) {
  return part2ChannelSurfaceAt(radius, verticalOffset).y;
}

// Legacy PART 3 callers now share the same measured recessed dark-race
// collider as the active PART 2 path. There is no second outer-track profile.
function makePart3OuterTrackTrimesh(verticalOffset = 0) {
  return makePart2RaceChannelTrimesh(verticalOffset);
}

function makeWorldTrimeshFromObject(object: THREE.Object3D) {
  const vertices: number[] = [];
  const indices: number[] = [];
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry;
    const position = geometry.getAttribute('position');
    if (!position) return;
    const base = vertices.length / 3;
    const worldPosition = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      worldPosition.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
      vertices.push(worldPosition.x, worldPosition.y, worldPosition.z);
    }
    if (geometry.index) {
      for (let index = 0; index < geometry.index.count; index += 1) {
        indices.push(base + geometry.index.getX(index));
      }
    } else {
      for (let index = 0; index < position.count; index += 3) {
        indices.push(base + index, base + index + 1, base + index + 2);
      }
    }
  });
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

function part4SpawnPosition(probe: (typeof PART4_PROBES)[number]) {
  return radialPosition(
    probe.radius,
    probe.angle,
    ROTOR_CONTACT_HEIGHT + BALL_RADIUS + 0.002,
  );
}

function part4InitialVelocity(probe: (typeof PART4_PROBES)[number]): VectorReadout {
  const surfaceSpeed = TEST_ANGULAR_SPEED * probe.radius;
  const totalSpeed = surfaceSpeed + probe.relativeSpeed;
  return {
    x: Number((Math.cos(probe.angle) * totalSpeed).toFixed(4)),
    y: 0,
    z: Number((-Math.sin(probe.angle) * totalSpeed).toFixed(4)),
  };
}

function addBowlBridgePrimitiveColliders(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  profile: readonly [number, number][],
  friction: number,
) {
  const colliders: RAPIER.Collider[] = [];
  const segments = 24;
  const halfThickness = BOWL_BRIDGE_THICKNESS / 2;

  for (let profileIndex = 0; profileIndex < profile.length - 1; profileIndex += 1) {
    const [radiusA, yA] = profile[profileIndex];
    const [radiusB, yB] = profile[profileIndex + 1];
    const deltaRadius = radiusB - radiusA;
    const deltaY = yB - yA;
    const profileLength = Math.hypot(deltaRadius, deltaY);
    if (profileLength <= 0.0001) continue;

    const slopeAngle = Math.atan2(deltaRadius, deltaY);
    const radialNormal = deltaY / profileLength;
    const verticalNormal = -deltaRadius / profileLength;
    const centerRadius =
      (radiusA + radiusB) / 2 + radialNormal * halfThickness;
    const centerY =
      (yA + yB) / 2 + verticalNormal * halfThickness;
    const halfProfileLength = profileLength / 2 + 0.003;
    const halfTangentialWidth =
      centerRadius * Math.tan(Math.PI / segments) * 1.04;

    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * TWO_PI;
      const yaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        angle,
      );
      const slope = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        slopeAngle,
      );
      const rotation = yaw.multiply(slope);
      const collider = RAPIER.ColliderDesc.cuboid(
        halfTangentialWidth,
        halfProfileLength,
        halfThickness,
      )
        .setTranslation(
          Math.sin(angle) * centerRadius,
          centerY,
          Math.cos(angle) * centerRadius,
        )
        .setRotation({
          x: rotation.x,
          y: rotation.y,
          z: rotation.z,
          w: rotation.w,
        })
        .setFriction(friction)
        .setRestitution(0.01)
        .setCollisionGroups(
          STATIONARY_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
        );
      colliders.push(world.createCollider(collider, body));
    }
  }

  return colliders;
}

function buildBowlBridgeTrimesh(
  profile: readonly [number, number][],
) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const bottomProfile = profile.map(
    ([radius, height]) =>
      [radius, height - BOWL_BRIDGE_THICKNESS] as [number, number],
  );

  const appendProfile = (rings: readonly [number, number][]) => {
    for (const [radius, height] of rings) {
      for (let segment = 0; segment < BOWL_BRIDGE_SEGMENTS; segment += 1) {
        const angle = (segment / BOWL_BRIDGE_SEGMENTS) * TWO_PI;
        vertices.push(
          Math.sin(angle) * radius,
          height,
          Math.cos(angle) * radius,
        );
      }
    }
  };

  appendProfile(profile);
  const bottomOffset = profile.length * BOWL_BRIDGE_SEGMENTS;
  appendProfile(bottomProfile);

  for (let row = 0; row < profile.length - 1; row += 1) {
    for (let segment = 0; segment < BOWL_BRIDGE_SEGMENTS; segment += 1) {
      const next = (segment + 1) % BOWL_BRIDGE_SEGMENTS;
      const topA = row * BOWL_BRIDGE_SEGMENTS + segment;
      const topB = row * BOWL_BRIDGE_SEGMENTS + next;
      const topC = (row + 1) * BOWL_BRIDGE_SEGMENTS + next;
      const topD = (row + 1) * BOWL_BRIDGE_SEGMENTS + segment;
      indices.push(topA, topD, topB, topB, topD, topC);

      const bottomA = bottomOffset + topA;
      const bottomB = bottomOffset + topB;
      const bottomC = bottomOffset + topC;
      const bottomD = bottomOffset + topD;
      indices.push(bottomA, bottomB, bottomD, bottomB, bottomC, bottomD);
    }
  }

  for (const row of [0, profile.length - 1]) {
    const bottomRow = bottomOffset + row * BOWL_BRIDGE_SEGMENTS;
    for (let segment = 0; segment < BOWL_BRIDGE_SEGMENTS; segment += 1) {
      const next = (segment + 1) % BOWL_BRIDGE_SEGMENTS;
      const topA = row * BOWL_BRIDGE_SEGMENTS + segment;
      const topB = row * BOWL_BRIDGE_SEGMENTS + next;
      const bottomA = bottomRow + segment;
      const bottomB = bottomRow + next;
      indices.push(topA, topB, bottomB, topA, bottomB, bottomA);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

function addMeasuredOuterWallColliders(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  profile: readonly [number, number][],
  friction: number,
  verticalOffset = 0,
) {
  const measured = [...profile].sort((left, right) => left[1] - right[1]);
  const segments = 512;
  const innerFaceRadius = PART2_ACTUAL_WOOD_INNER_RADIUS;
  const lowerY =
    part2ChannelSurfaceAt(innerFaceRadius, verticalOffset).y -
    BALL_RADIUS * 2 -
    0.02;
  const measuredMaxY = Math.max(...measured.map(([, height]) => height));
  const upperY = Math.max(
    measuredMaxY + BALL_RADIUS + 0.10,
    lowerY + 0.24,
  );
  const vertices: number[] = [];
  const indices: number[] = [];

  for (const y of [lowerY, upperY]) {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * TWO_PI;
      vertices.push(
        Math.sin(angle) * innerFaceRadius,
        y,
        Math.cos(angle) * innerFaceRadius,
      );
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    const lowerA = segment;
    const lowerB = next;
    const upperA = segments + segment;
    const upperB = segments + next;
    indices.push(
      lowerA,
      upperB,
      lowerB,
      lowerA,
      upperA,
      upperB,
    );
  }

  const collider = world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      new Float32Array(vertices),
      new Uint32Array(indices),
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES |
        RAPIER.TriMeshFlags.ORIENTED,
    )
      .setFriction(Math.min(friction, 0.01))
      .setRestitution(0.01)
      .setCollisionGroups(
        STATIONARY_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
      ),
    body,
  );

  return {
    colliders: [collider],
    samples: [[innerFaceRadius, lowerY], [innerFaceRadius, upperY]] as Array<[number, number]>,
    segments,
  };
}

function buildPocketFloorTrimesh(
  outerLipY: number = POCKET_OUTER_LIP_Y,
) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const profile: Array<[number, number]> = [
    [POCKET_FLOOR_OUTER_RADIUS, POCKET_FLOOR_Y],
    [POCKET_OUTER_LIP_RADIUS, outerLipY],
  ];

  for (const [radius, height] of profile) {
    for (let index = 0; index < POCKET_FLOOR_SEGMENTS; index += 1) {
      const angle = (index / POCKET_FLOOR_SEGMENTS) * TWO_PI;
      vertices.push(
        Math.sin(angle) * radius,
        height,
        Math.cos(angle) * radius,
      );
    }
  }

  for (let index = 0; index < POCKET_FLOOR_SEGMENTS; index += 1) {
    const next = (index + 1) % POCKET_FLOOR_SEGMENTS;
    const innerA = index;
    const outerA = POCKET_FLOOR_SEGMENTS + index;
    const outerB = POCKET_FLOOR_SEGMENTS + next;
    const innerB = next;
    indices.push(innerA, outerA, outerB, innerA, outerB, innerB);
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

function addKinematicPocketInnerGuard(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
) {
  const verticalHalfHeight = 0.11;
  const centerY = POCKET_FLOOR_Y + verticalHalfHeight;
  return world.createCollider(
    RAPIER.ColliderDesc.roundCylinder(
      verticalHalfHeight - POCKET_INNER_GUARD_EDGE_ROUNDING,
      POCKET_FLOOR_INNER_RADIUS - POCKET_INNER_GUARD_EDGE_ROUNDING,
      POCKET_INNER_GUARD_EDGE_ROUNDING,
    )
      .setTranslation(0, centerY, 0)
      .setFriction(0.42)
      .setRestitution(0.02)
      .setCollisionGroups(
        ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
      ),
    body,
  );
}

function addKinematicPocketSystem(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  outerLipY: number = POCKET_OUTER_LIP_Y,
) {
  const colliders: RAPIER.Collider[] = [];
  colliders.push(
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(
        POCKET_FLOOR_THICKNESS / 2,
        POCKET_FLOOR_OUTER_RADIUS,
      )
        .setTranslation(
          0,
          POCKET_FLOOR_Y - POCKET_FLOOR_THICKNESS / 2,
          0,
        )
        .setFriction(0.42)
        .setRestitution(0.02)
        .setCollisionGroups(ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16)),
      body,
    ),
  );
  const floorMesh = buildPocketFloorTrimesh(outerLipY);
  colliders.push(
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        floorMesh.vertices,
        floorMesh.indices,
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES |
          RAPIER.TriMeshFlags.ORIENTED,
      )
        .setTranslation(0, 0, 0)
        .setFriction(0.42)
        .setRestitution(0.02)
        .setCollisionGroups(ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16)),
      body,
    ),
  );
  for (let index = 0; index < EUROPEAN_POCKET_COUNT; index += 1) {
    const angle = (index + 0.5) * POCKET_STEP_RADIANS;
    const collider = RAPIER.ColliderDesc.roundCuboid(
      POCKET_FRET_TANGENTIAL_HALF_EXTENT - POCKET_FRET_EDGE_ROUNDING,
      POCKET_FRET_VERTICAL_HALF_EXTENT - POCKET_FRET_EDGE_ROUNDING,
      POCKET_FRET_RADIAL_HALF_EXTENT - POCKET_FRET_EDGE_ROUNDING,
      POCKET_FRET_EDGE_ROUNDING,
    )
      .setTranslation(...radialPosition(POCKET_FRET_RADIUS, angle, POCKET_FRET_Y))
      .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
      .setFriction(0.42)
      .setRestitution(0.02)
      .setCollisionGroups(ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16));
    colliders.push(world.createCollider(collider, body));
  }
  return colliders;
}

function pocketIndexFromLocalPosition(x: number, z: number) {
  return (
    Math.round(normalizedAngle(Math.atan2(x, z)) / POCKET_STEP_RADIANS) %
    EUROPEAN_POCKET_COUNT
  );
}

function pocketEntryVelocity(angle: number, tangentialSpeed: number): VectorReadout {
  return {
    x: Math.cos(angle) * tangentialSpeed,
    y: -0.22,
    z: -Math.sin(angle) * tangentialSpeed,
  };
}

function runPocketEntryValidation(
  world: RAPIER.World,
  rotorBody: RAPIER.RigidBody,
  ballBody: RAPIER.RigidBody,
  ballCollider: RAPIER.Collider,
  pocketColliders: RAPIER.Collider[],
  initialRotorAngle: number,
  ballMesh: THREE.Mesh,
  visibleSurfaceAt: (
    x: number,
    z: number,
  ) => {
    y: number;
    source: string;
    point: VectorReadout;
    normal: VectorReadout;
  } | null,
  colliderRoles: ReadonlyMap<number, string>,
  trackCollider: RAPIER.Collider | null,
): PocketValidationReport {
  const results: PocketEntryProbeResult[] = [];
  // These probes reuse the live GLB runtime world. They only reset the existing
  // dynamic ball and kinematic rotor between cases; no probe owns a world or
  // creates a second collider set.
  const rotorAngularSpeed = 0;

  for (const probe of PART1_PROBES) {
    const targetAngle =
      probe.kind === 'pocket-aperture'
        ? probe.targetPocketIndex * POCKET_STEP_RADIANS + probe.angularOffset
        : probe.angle;
    const samplePosition = radialPosition(probe.radius, targetAngle, 0);
    const visibleSurface = visibleSurfaceAt(samplePosition[0], samplePosition[2]);
    const contactSurfaceY =
      probe.kind === 'pocket-aperture'
        ? POCKET_FLOOR_Y
        : visibleSurface?.y ?? part3TrackHeight(probe.radius);
    const entryPosition =
      probe.kind === 'side-track' && visibleSurface
        ? [
            visibleSurface.point.x +
              visibleSurface.normal.x *
                (BALL_RADIUS + PART1_SIDE_TRACK_CONTACT_TOLERANCE),
            visibleSurface.point.y +
              visibleSurface.normal.y *
                (BALL_RADIUS + PART1_SIDE_TRACK_CONTACT_TOLERANCE),
            visibleSurface.point.z +
              visibleSurface.normal.z *
                (BALL_RADIUS + PART1_SIDE_TRACK_CONTACT_TOLERANCE),
          ]
        : radialPosition(
            probe.radius,
            targetAngle,
            probe.kind === 'pocket-aperture'
              ? POCKET_FLOOR_Y + BALL_RADIUS + 0.18
              : contactSurfaceY + BALL_RADIUS,
          );
    const sideTrackSurfacePoint =
      probe.kind === 'side-track' && visibleSurface
        ? new THREE.Vector3(
            visibleSurface.point.x,
            visibleSurface.point.y,
            visibleSurface.point.z,
          )
        : null;
    const sideTrackSurfaceNormal =
      probe.kind === 'side-track' && visibleSurface
        ? new THREE.Vector3(
            visibleSurface.normal.x,
            visibleSurface.normal.y,
            visibleSurface.normal.z,
          )
        : null;
    const entryVelocity =
      probe.kind === 'bowl-contact'
        ? { x: 0, y: -0.7, z: 0 }
        : probe.kind === 'side-track'
          ? { x: 0, y: 0, z: 0 }
          : pocketEntryVelocity(targetAngle, probe.tangentialSpeed);
    ballBody.setTranslation(
      { x: entryPosition[0], y: entryPosition[1], z: entryPosition[2] },
      true,
    );
    ballBody.setLinvel(entryVelocity, true);
    ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    ballBody.wakeUp();
    rotorBody.setNextKinematicRotation({
      x: 0,
      y: Math.sin(initialRotorAngle / 2),
      z: 0,
      w: Math.cos(initialRotorAngle / 2),
    });
    const fretHandles = new Set(
      pocketColliders
        .slice(1, EUROPEAN_POCKET_COUNT + 1)
        .map((collider) => collider.handle),
    );
    let peakBallSpeed = 0;
    let maxPenetration = 0;
    let maxSeparation = 0;
    let maxVisualBodySyncError = 0;
    let maxRotorSyncError = 0;
    let previousSpeed = Math.hypot(
      entryVelocity.x,
      entryVelocity.y,
      entryVelocity.z,
    );
    let settledFrames = 0;
    let fretContact = false;
    let physicalContact = false;
    let contactColliderType: string | null = null;
    let escaped = false;
    let tunneled = false;
    let artificialEnergyInjection = false;
    let rotorAngle = normalizedAngle(initialRotorAngle);

    const durationSteps = Math.round(probe.durationSeconds / FIXED_TIMESTEP);
    for (let step = 0; step < durationSteps; step += 1) {
      rotorAngle += rotorAngularSpeed * FIXED_TIMESTEP;
      rotorBody.setNextKinematicRotation({
        x: 0,
        y: Math.sin(rotorAngle / 2),
        z: 0,
        w: Math.cos(rotorAngle / 2),
      });
      world.step();
      const position = ballBody.translation();
      const velocity = ballBody.linvel();
      const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
      const radius = Math.hypot(position.x, position.z);
      const bottom = position.y - BALL_RADIUS;
      const normalDistance =
        sideTrackSurfacePoint && sideTrackSurfaceNormal
          ? new THREE.Vector3(position.x, position.y, position.z)
              .sub(sideTrackSurfacePoint)
              .dot(sideTrackSurfaceNormal)
          : bottom - contactSurfaceY;
      const penetration =
        sideTrackSurfacePoint && sideTrackSurfaceNormal
          ? Math.max(0, BALL_RADIUS - normalDistance)
          : Math.max(0, contactSurfaceY - bottom);
      const separation =
        sideTrackSurfacePoint && sideTrackSurfaceNormal
          ? Math.max(0, normalDistance - BALL_RADIUS)
          : Math.max(0, bottom - contactSurfaceY);
      const rotorRotation = rotorBody.rotation();
      const bodyRotorAngle = normalizedAngle(
        2 * Math.atan2(rotorRotation.y, rotorRotation.w),
      );
      maxRotorSyncError = Math.max(
        maxRotorSyncError,
        Math.abs(
          THREE.MathUtils.euclideanModulo(
            bodyRotorAngle - rotorAngle + Math.PI,
            TWO_PI,
          ) - Math.PI,
        ),
      );
      maxVisualBodySyncError = 0;
      peakBallSpeed = Math.max(peakBallSpeed, speed);
      maxPenetration = Math.max(maxPenetration, penetration);
      maxSeparation = Math.max(maxSeparation, separation);
      world.contactPairsWith(ballCollider, (otherCollider) => {
        const role =
          colliderRoles.get(otherCollider.handle) ??
          (trackCollider?.handle === otherCollider.handle
            ? 'actual-glb-outside-trimesh'
            : null);
        if (role) {
          physicalContact = true;
          contactColliderType = role;
        }
        if (fretHandles.has(otherCollider.handle)) fretContact = true;
      });
      ballMesh.position.set(position.x, position.y, position.z);
      const rotation = ballBody.rotation();
      ballMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      const minimumValidRadius =
        probe.kind === 'pocket-aperture'
          ? POCKET_FLOOR_INNER_RADIUS - 0.14
          : probe.kind === 'side-track'
            ? 2.12
            : 1.72;
      const maximumValidRadius =
        probe.kind === 'pocket-aperture'
          ? POCKET_OUTER_LIP_RADIUS
          : probe.kind === 'side-track'
            ? 2.62
            : 2.42;
      escaped ||=
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y) ||
        !Number.isFinite(position.z) ||
        radius < minimumValidRadius ||
        radius > maximumValidRadius ||
        position.y < contactSurfaceY - BALL_RADIUS - 0.18;
      tunneled ||= penetration > 0.08;
      artificialEnergyInjection ||=
        speed > Math.max(8, previousSpeed * 4);
      if (
        speed < 0.12 &&
        radius >= POCKET_FLOOR_INNER_RADIUS + BALL_RADIUS &&
        radius <= POCKET_FLOOR_OUTER_RADIUS - BALL_RADIUS &&
        Math.abs(bottom - POCKET_FLOOR_Y) <= 0.12
      ) {
        settledFrames += 1;
      } else {
        settledFrames = 0;
      }
      previousSpeed = speed;
    }

    const finalPosition = ballBody.translation();
    const finalVelocity = ballBody.linvel();
    const finalSpeed = Math.hypot(
      finalVelocity.x,
      finalVelocity.y,
      finalVelocity.z,
    );
    const finalRadius = Math.hypot(finalPosition.x, finalPosition.z);
    const finalAngle = normalizedAngle(
      Math.atan2(finalPosition.x, finalPosition.z) - rotorAngle,
    );
    const finalPocketIndex =
      probe.kind === 'pocket-aperture' &&
      finalRadius >= POCKET_FLOOR_INNER_RADIUS + BALL_RADIUS &&
      finalRadius <= POCKET_FLOOR_OUTER_RADIUS - BALL_RADIUS
        ? pocketIndexFromLocalPosition(
            Math.sin(finalAngle),
            Math.cos(finalAngle),
          )
        : null;
    const settled =
      settledFrames >= Math.round(0.5 / FIXED_TIMESTEP) && finalSpeed < 0.12;
    const pocketMatch =
      probe.kind !== 'pocket-aperture' ||
      finalPocketIndex === probe.targetPocketIndex;
    const passed =
      !escaped &&
      !tunneled &&
      !artificialEnergyInjection &&
      maxRotorSyncError <= 0.000001 &&
      (probe.kind === 'pocket-aperture'
        ? settled && pocketMatch && physicalContact
        : physicalContact && maxPenetration <= 0.03);

    results.push({
      id: probe.id,
      label: probe.label,
      kind: probe.kind,
      sampleRadius: visibleSurface
        ? Number(Math.hypot(visibleSurface.point.x, visibleSurface.point.z).toFixed(4))
        : null,
      surfacePoint: visibleSurface?.point ?? null,
      surfaceNormal: visibleSurface?.normal ?? null,
      ballCenterPosition: {
        x: Number(entryPosition[0].toFixed(4)),
        y: Number(entryPosition[1].toFixed(4)),
        z: Number(entryPosition[2].toFixed(4)),
      },
      targetPocketIndex:
        probe.kind === 'pocket-aperture' ? probe.targetPocketIndex : null,
      targetPocketNumber:
        probe.kind === 'pocket-aperture'
          ? EUROPEAN_SEQUENCE[probe.targetPocketIndex]
          : null,
      rotorAngularSpeed,
      entryVelocity,
      peakBallSpeed: Number(peakBallSpeed.toFixed(4)),
      maxPenetration: Number(maxPenetration.toFixed(4)),
      maxSeparation: Number(maxSeparation.toFixed(4)),
      fretContact,
      physicalContact,
      contactColliderType,
      artificialEnergyInjection,
      escaped,
      tunneled,
      settled,
      finalPocketIndex,
      finalPocketNumber:
        finalPocketIndex === null ? null : EUROPEAN_SEQUENCE[finalPocketIndex],
      maxVisualBodySyncError,
      maxRotorSyncError: Number(maxRotorSyncError.toFixed(6)),
      detail: passed
        ? probe.kind === 'pocket-aperture'
          ? fretContact
            ? 'Stable pocket settle with controlled fret contact.'
            : 'Stable pocket-center settle without fret contact.'
          : `Authoritative ${probe.kind} contact verified at ${contactColliderType ?? 'unknown collider'}.`
        : `PART 1 probe failed: ${[
            escaped && 'escape',
            tunneled && 'tunneling',
            artificialEnergyInjection && 'energy injection',
            probe.kind !== 'pocket-aperture' &&
              maxPenetration > 0.03 &&
              'penetration guard',
            probe.kind === 'pocket-aperture' && !settled && 'no stable settle',
            !pocketMatch && 'wrong final pocket',
            !physicalContact && 'no authoritative-world contact',
          ]
            .filter(Boolean)
            .join(', ') || 'review required'}.`,
    });
  }

  const passed = results.filter((result) => {
    const contactOutcome =
      result.kind === 'pocket-aperture'
        ? result.settled &&
          result.finalPocketIndex === result.targetPocketIndex &&
          result.physicalContact
        : result.physicalContact && result.maxPenetration <= 0.03;
    return (
      contactOutcome &&
      !result.escaped &&
      !result.tunneled &&
      !result.artificialEnergyInjection &&
      result.maxRotorSyncError <= 0.000001
    );
  }).length;
  return {
    status: passed === PART1_PROBES.length ? 'passed' : 'failed',
    results,
    detail:
      passed === PART1_PROBES.length
        ? 'All three PART 1 probes passed in the authoritative GLB world at 120 Hz with CCD.'
        : `${PART1_PROBES.length - passed} PART 1 probe(s) need geometry review.`,
  };
}

function addKinematicRotorBand(world: RAPIER.World, body: RAPIER.RigidBody) {
  const colliders: RAPIER.Collider[] = [];
  for (let index = 0; index < ROTOR_CONTACT_SEGMENTS; index += 1) {
    const angle = (index / ROTOR_CONTACT_SEGMENTS) * TWO_PI;
    const collider = RAPIER.ColliderDesc.roundCuboid(
      (ROTOR_CONTACT_RADIUS * Math.PI) / ROTOR_CONTACT_SEGMENTS,
      0.018,
      0.16,
      0.025,
    )
      .setTranslation(...radialPosition(ROTOR_CONTACT_RADIUS, angle, ROTOR_CONTACT_HEIGHT))
      .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
      .setFriction(0.42)
      .setRestitution(0.02)
      .setCollisionGroups(ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16));
    colliders.push(world.createCollider(collider, body));
  }
  return colliders;
}

function countMeshes(object: THREE.Object3D) {
  let count = 0;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) count += 1;
  });
  return count;
}

function countTriangles(object: THREE.Object3D) {
  let triangles = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    const index = child.geometry.getIndex();
    triangles += index ? index.count / 3 : (position?.count ?? 0) / 3;
  });
  return Math.round(triangles);
}

function roundedVector(vector: THREE.Vector3): VectorReadout {
  return {
    x: Number(vector.x.toFixed(4)),
    y: Number(vector.y.toFixed(4)),
    z: Number(vector.z.toFixed(4)),
  };
}

function normalizedAngle(angle: number) {
  return THREE.MathUtils.euclideanModulo(angle, TWO_PI);
}

function radialPosition(radius: number, angle: number, y: number): [number, number, number] {
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
}

function part2ChannelSurfaceAt(
  radius: number,
  verticalOffset = 0,
  profile: readonly (readonly [number, number])[] = PART2_CHANNEL_PROFILE,
) {
  const clamped = Math.max(
    profile[0][0],
    Math.min(profile.at(-1)![0], radius),
  );
  for (let index = 1; index < profile.length; index += 1) {
    const [rightRadius, rightY] = profile[index];
    const [leftRadius, leftY] = profile[index - 1];
    if (clamped <= rightRadius) {
      const alpha = (clamped - leftRadius) / (rightRadius - leftRadius);
      return {
        y: THREE.MathUtils.lerp(leftY, rightY, alpha) + verticalOffset,
        slope: (rightY - leftY) / (rightRadius - leftRadius),
        segment: index - 1,
      };
    }
  }
  const last = profile.at(-1)!;
  const previous = profile.at(-2)!;
  return {
    y: last[1] + verticalOffset,
    slope: (last[1] - previous[1]) / (last[0] - previous[0]),
    segment: profile.length - 2,
  };
}

function part2ChannelNormalAt(radius: number, angle: number) {
  const { slope } = part2ChannelSurfaceAt(radius);
  const radial = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  return new THREE.Vector3(
    -slope * radial.x,
    1,
    -slope * radial.z,
  ).normalize();
}

function makePart2RaceChannelTrimesh(
  verticalOffset = 0,
  openInnerRadius: number | null = null,
  outerRadiusLimit: number | null = null,
) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const segments = 512;
  const baseProfile: Array<[number, number]> =
    openInnerRadius === null
      ? PART2_COLLISION_CHANNEL_PROFILE.map(([radius, y]) => [radius, y])
      : [
          [
            openInnerRadius,
            part2ChannelSurfaceAt(
              openInnerRadius,
              0,
              PART2_COLLISION_CHANNEL_PROFILE,
            ).y,
          ],
          ...PART2_COLLISION_CHANNEL_PROFILE
            .filter(([radius]) => radius > openInnerRadius)
            .map(([radius, y]) => [radius, y] as [number, number]),
        ];
  const activeProfile =
    outerRadiusLimit === null
      ? baseProfile
      : baseProfile.filter(([radius]) => radius <= outerRadiusLimit);
  const appendProfile = (
    profile: readonly (readonly [number, number])[],
  ) => {
    for (const [radius, y] of profile) {
      for (let segment = 0; segment < segments; segment += 1) {
        const angle = (segment / segments) * TWO_PI;
        vertices.push(
          Math.sin(angle) * radius,
          y + verticalOffset,
          Math.cos(angle) * radius,
        );
      }
    }
  };
  const bottomProfile = activeProfile.map(
    ([radius, y]) =>
      [radius, y - PART2_CHANNEL_BOTTOM_THICKNESS] as [number, number],
  );
  appendProfile(activeProfile);
  const bottomOffset = activeProfile.length * segments;
  appendProfile(bottomProfile);

  for (let row = 0; row < activeProfile.length - 1; row += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const topA = row * segments + segment;
      const topB = row * segments + next;
      const topC = (row + 1) * segments + next;
      const topD = (row + 1) * segments + segment;
      indices.push(topA, topD, topB, topB, topD, topC);

      const bottomA = bottomOffset + topA;
      const bottomB = bottomOffset + topB;
      const bottomC = bottomOffset + topC;
      const bottomD = bottomOffset + topD;
      indices.push(bottomA, bottomB, bottomD, bottomB, bottomC, bottomD);
    }
  }
  const closedRows = [
    ...(openInnerRadius === null ? [0] : []),
    ...(outerRadiusLimit === null ? [activeProfile.length - 1] : []),
  ];
  for (const row of closedRows) {
    const nextRow = bottomOffset + row * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const topA = row * segments + segment;
      const topB = row * segments + next;
      const bottomA = nextRow + segment;
      const bottomB = nextRow + next;
      indices.push(topA, topB, bottomB, topA, bottomB, bottomA);
    }
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

function profileHeight(radius: number) {
  const clamped = Math.max(BOWL_PROFILE[0][0], Math.min(BOWL_PROFILE.at(-1)![0], radius));
  for (let index = 1; index < BOWL_PROFILE.length; index += 1) {
    const [rightRadius, rightY] = BOWL_PROFILE[index];
    const [leftRadius, leftY] = BOWL_PROFILE[index - 1];
    if (clamped <= rightRadius) {
      const alpha = (clamped - leftRadius) / (rightRadius - leftRadius);
      return THREE.MathUtils.lerp(leftY, rightY, alpha);
    }
  }
  return BOWL_PROFILE.at(-1)![1];
}

const DROP_TRACK_Y = profileHeight(DROP_RADIUS);
const ROTOR_CONTACT_HEIGHT = profileHeight(ROTOR_CONTACT_RADIUS) + 0.04;
const DROP_INITIAL_POSITION = radialPosition(
  DROP_RADIUS,
  0,
  DROP_TRACK_Y + DROP_HEIGHT_ABOVE_SURFACE,
);

function makeProfileTrimesh() {
  const vertices: number[] = [];
  const indices: number[] = [];
  const profileCount = BOWL_PROFILE.length;

  for (const [radius, y] of BOWL_PROFILE) {
    for (let segment = 0; segment < PROFILE_SEGMENTS; segment += 1) {
      const angle = (segment / PROFILE_SEGMENTS) * TWO_PI;
      vertices.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
    }
  }
  const bottomOffset = profileCount * PROFILE_SEGMENTS;
  for (const [radius, y] of BOWL_PROFILE) {
    for (let segment = 0; segment < PROFILE_SEGMENTS; segment += 1) {
      const angle = (segment / PROFILE_SEGMENTS) * TWO_PI;
      vertices.push(
        Math.sin(angle) * radius,
        y - PROFILE_SHELL_THICKNESS,
        Math.cos(angle) * radius,
      );
    }
  }
  for (let row = 0; row < profileCount - 1; row += 1) {
    for (let segment = 0; segment < PROFILE_SEGMENTS; segment += 1) {
      const next = (segment + 1) % PROFILE_SEGMENTS;
      const a = row * PROFILE_SEGMENTS + segment;
      const b = row * PROFILE_SEGMENTS + next;
      const c = (row + 1) * PROFILE_SEGMENTS + next;
      const d = (row + 1) * PROFILE_SEGMENTS + segment;
      indices.push(a, d, b, b, d, c);

      const ba = bottomOffset + a;
      const bb = bottomOffset + b;
      const bc = bottomOffset + c;
      const bd = bottomOffset + d;
      indices.push(ba, bb, bd, bb, bc, bd);
    }
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  };
}

function addRetainingRim(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  radius: number,
  y: number,
) {
  const colliders: RAPIER.Collider[] = [];
  const count = 32;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * TWO_PI;
    const collider = RAPIER.ColliderDesc.roundCuboid(
      (radius * Math.PI) / count * 0.9,
      0.11,
      0.07,
      0.025,
    )
      .setTranslation(...radialPosition(radius, angle, y))
      .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
      .setFriction(0.45)
      .setRestitution(0.02);
    colliders.push(world.createCollider(collider, body));
  }
  return colliders;
}

function addProfileSupportRings(world: RAPIER.World, body: RAPIER.RigidBody) {
  const count = 48;
  const colliders: RAPIER.Collider[] = [];
  for (let profileIndex = 0; profileIndex < BOWL_PROFILE.length; profileIndex += 1) {
    const [radius, y] = BOWL_PROFILE[profileIndex];
    const previousRadius = BOWL_PROFILE[profileIndex - 1]?.[0] ?? radius;
    const nextRadius = BOWL_PROFILE[profileIndex + 1]?.[0] ?? radius;
    const radialHalfExtent =
      Math.max(radius - previousRadius, nextRadius - radius) / 2 + 0.01;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * TWO_PI;
      const collider = RAPIER.ColliderDesc.roundCuboid(
        Math.max(0.05, (radius * Math.PI) / count),
        0.018,
        radialHalfExtent,
        0.025,
      )
        .setTranslation(...radialPosition(radius, angle, y))
        .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) })
        .setFriction(0.42)
        .setRestitution(0.02);
      colliders.push(world.createCollider(collider, body));
    }
  }
  return colliders;
}

function createBallVisual() {
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 20),
    new THREE.MeshPhysicalMaterial({
      color: '#f5f1dc',
      roughness: 0.14,
      metalness: 0.08,
      clearcoat: 0.32,
    }),
  );
  ball.name = 'Part2__DynamicBallVisual';
  ball.castShadow = true;
  return ball;
}

export function Part2SceneViewport({
  loadKey,
  validationMode = 'part2',
  part1ProbeOnly = false,
  alignmentOnly = false,
  outerLaneOnly = false,
  outerLaneSpinOnly = false,
  geometryDiagnosticOnly = false,
  view,
  showGrid,
  showPhysicsDebug,
  showBallPlaceholder,
  showStationaryGroup,
  showRotorGroup,
  rotorAngle,
  onStateChange,
  onAudit,
  onRotorAngleChange,
}: Part2SceneViewportProps) {
  const part6FullSpinRouteActive =
    validationMode === 'part3' && outerLaneSpinOnly;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef(view);
  const callbacksRef = useRef({ onStateChange, onAudit, onRotorAngleChange });
  const rotorAngleRef = useRef(normalizedAngle(rotorAngle));
  const [angleReadout, setAngleReadout] = useState(normalizedAngle(rotorAngle));
  const [dropReport, setDropReport] = useState<Part2DropReport | null>(null);
  const [part3Report, setPart3Report] = useState<Part3ValidationReport | null>(null);
  const [part3OuterLaneReport, setPart3OuterLaneReport] =
    useState<Part3OuterLaneReport | null>(null);
  const [part3OuterLaneSpinReport, setPart3OuterLaneSpinReport] =
    useState<Part3OuterLaneSpinReport | null>(null);
  const [part6TelemetryReport, setPart6TelemetryReport] =
    useState<Part6FullSpinTelemetryReport | null>(null);
  const [part2RacePlacementReport, setPart2RacePlacementReport] =
    useState<Part2RacePlacementReport | null>(null);
  const [part3GeometryDiagnosticReport, setPart3GeometryDiagnosticReport] =
    useState<Part3GeometryDiagnosticReport | null>(null);
  const [part3AlignmentReport, setPart3AlignmentReport] =
    useState<Part3AlignmentReport | null>(null);
  const [part4Report, setPart4Report] = useState<Part4ValidationReport | null>(null);
  const [pocketReport, setPocketReport] = useState<PocketValidationReport | null>(null);

  viewRef.current = view;
  callbacksRef.current = { onStateChange, onAudit, onRotorAngleChange };

  useEffect(() => {
    rotorAngleRef.current = normalizedAngle(rotorAngle);
  }, [rotorAngle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;

    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let wheelRoot: THREE.Group | null = null;
    let stationaryGroup: THREE.Group | null = null;
    let rotorPivot: THREE.Group | null = null;
    let ballMesh: THREE.Mesh | null = null;
    let world: RAPIER.World | null = null;
    let ballBody: RAPIER.RigidBody | null = null;
    let rotorBody: RAPIER.RigidBody | null = null;
    let physicsBallCollider: RAPIER.Collider | null = null;
    let part3TrackCollider: RAPIER.Collider | null = null;
    let part3BowlBridgeColliders: RAPIER.Collider[] = [];
    let part3BowlBridgeProfile: Array<[number, number]> = [];
    let part3BowlBridgeOuterRadius: number = BOWL_BRIDGE_OUTER_RADIUS;
    let part3InnerFloorCollider: RAPIER.Collider | null = null;
    let part3DeflectorColliders: RAPIER.Collider[] = [];
    let part4DeflectorAudit: Part4DeflectorAudit | null = null;
    let part4MeasuredDeflectorInnerRadius: number | null = null;
    let part4MeasuredDeflectorOuterRadius: number | null = null;
    let part3PocketColliders: RAPIER.Collider[] = [];
    const part3ColliderRoles = new Map<number, string>();
    let rotorColliders: RAPIER.Collider[] = [];
    let accumulator = 0;
    let lastTime = performance.now();
    let fixedStepCount = 0;
    let part6TelemetryBatchRunning = false;
    const activePart3TrackFriction = outerLaneSpinOnly
      ? PART3_OUTER_SPIN_TRACK_FRICTION
      : PART3_TRACK_FRICTION;
    const activePart3LinearDamping = outerLaneSpinOnly
      ? PART3_OUTER_SPIN_LINEAR_DAMPING
      : PART3_TRACK_DAMPING;
    const activePart3AngularDamping = outerLaneSpinOnly
      ? PART3_OUTER_SPIN_ANGULAR_DAMPING
      : PART3_TRACK_DAMPING;
    // Full-spin validation uses hard CCD only. A 0.14 wu soft-CCD
    // prediction envelope creates speculative outer-wall contacts before
    // the 0.056 wu ball is geometrically touching the measured wall.
    const activeBallSoftCcdPrediction =
      validationMode === 'part3' && outerLaneSpinOnly
        ? 0
        : BALL_RADIUS * 2.5;
    let dropStarted = false;
    let dropSteps = 0;
    let previousVerticalVelocity = 0;
    let firstContact: VectorReadout | null = null;
    let firstContactRadius: number | null = null;
    let firstContactTime: number | null = null;
    let maxPenetration = 0;
    let maxSeparation = 0;
    let maxVisualBodySyncError = 0;
    let ccdEnabled = false;
    let visibleSurfaceMatch = false;
    let part3ProbeIndex = 0;
    let part3Elapsed = 0;
    let part3PeakSpeed = 0;
    let part3MinRadius = Number.POSITIVE_INFINITY;
    let part3MaxRadius = 0;
    let part3MaxPenetration = 0;
    let part3MaxSeparation = 0;
    let part3ContactFrames = 0;
    let part3SampleFrames = 0;
    let part3MaxVisualBodySyncError = 0;
    let part3LeftValidVolume = false;
    let part3TrackAngle: number | null = null;
    let part3TrackAngleStart: number | null = null;
    let part3TrackAngleEnd: number | null = null;
    let part3TrackContactFrames = 0;
    let part3TrackSampleFrames = 0;
    let part3TrackSpeedSum = 0;
    let part3TrackStartSpeed = 0;
    let part3TrackEndSpeed = 0;
    let part3TrackLapSpeeds: number[] = [];
    let part3TrackCompletedLaps = 0;
    let part3InwardDescentTime: number | null = null;
    let part3InwardDescentRadius: number | null = null;
    let part3ArtificialAcceleration = false;
    let part3Hover = false;
    let part3Clipping = false;
    let part3BouncePlausible = true;
    let part3PreviousSpeed = 0;
    let part3DeflectorContact = false;
    let part3DeflectorContactTime: number | null = null;
    let part3ImpactSpeedBefore: number | null = null;
    let part3ImpactSpeedAfter: number | null = null;
    let part3ImpactDirectionBefore: THREE.Vector3 | null = null;
    let part3ImpactDirectionAfter: THREE.Vector3 | null = null;
    let part3EarlyLapMinimumDeflectorClearance: number | null = null;
    let part3DeflectorPassThrough = false;
    let part3Results: Part3ProbeResult[] = [];
    let part3Finished = false;
    let part3OuterLaneRunning = false;
    let part3OuterLaneElapsed = 0;
    let part3OuterLaneLaunchRadius = PART3_LAUNCH_RADIUS;
    let part3OuterLaneLaunchAzimuth = 0.37;
    let part3OuterLaneLaunchHeight = 0;
    let part3OuterLaneInitialVelocity = part3TangentialVelocity(
      part3OuterLaneLaunchAzimuth,
      PART3_PROBES[0].speed,
    );
    let part3OuterLaneInitialLinearSpeed = PART3_PROBES[0].speed;
    let part3OuterLaneInitialAngularSpin = part3InitialAngularSpin(PART3_PROBES[0]);
    let part3OuterLanePeakSpeed = 0;
    let part3OuterLaneInitialRadius = PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS;
    let part3OuterLaneMinRadius = Number.POSITIVE_INFINITY;
    let part3OuterLaneMaxRadius = 0;
    let part3OuterLaneMinRimClearance = Number.POSITIVE_INFINITY;
    let part3OuterLaneMinDeflectorClearance = Number.POSITIVE_INFINITY;
    let part3OuterLaneTrackContactFrames = 0;
    let part3OuterLaneSampleFrames = 0;
    let part3OuterLaneMaxPenetration = 0;
    let part3OuterLaneMaxSeparation = 0;
    let part3OuterLaneDeflectorContact = false;
    let part3OuterLaneWoodContact = false;
    let part3OuterLaneHover = false;
    let part3OuterLaneClipping = false;
    let part3OuterLaneTunneling = false;
    let part3OuterLaneEscaped = false;
    let part3OuterLaneVelocitySpike = false;
    let part3OuterLaneMaxVisualBodySyncError = 0;
    let part3OuterLaneSpinRunning = false;
    let part3OuterLaneSpinIndex = 0;
    let part3OuterLaneSpinElapsed = 0;
    let part3OuterLaneSpinResults: Part3OuterLaneSpinResult[] = [];
    let part3OuterLaneSpinTrackAngle: number | null = null;
    let part3OuterLaneSpinTrackAngleStart: number | null = null;
    let part3OuterLaneSpinTrackAngleEnd: number | null = null;
    let part3OuterLaneSpinCompletedLaps = 0;
    let part3OuterLaneSpinLapSpeeds: number[] = [];
    let part3OuterLaneSpinTrackFrames = 0;
    let part3OuterLaneSpinContactFrames = 0;
    let part3OuterLaneSpinSpeedSum = 0;
    let part3OuterLaneSpinStartSpeed = 0;
    let part3OuterLaneSpinEndSpeed = 0;
    let part3OuterLaneSpinPeakSpeed = 0;
    let part3OuterLaneSpinMinRadius = Number.POSITIVE_INFINITY;
    let part3OuterLaneSpinMaxRadius = 0;
    let part3OuterLaneSpinMinRimClearance = Number.POSITIVE_INFINITY;
    let part3OuterLaneSpinMinDeflectorClearance = Number.POSITIVE_INFINITY;
    let part3OuterLaneSpinMaxPenetration = 0;
    let part3OuterLaneSpinMaxSeparation = 0;
    let part3OuterLaneSpinWoodContact = false;
    let part3OuterLaneSpinHover = false;
    let part3OuterLaneSpinClipping = false;
    let part3OuterLaneSpinTunneling = false;
    let part3OuterLaneSpinEscaped = false;
    let part3OuterLaneSpinVelocitySpike = false;
    let part3OuterLaneSpinArtificialAcceleration = false;
    let part3OuterLaneSpinMaxVisualBodySyncError = 0;
    let part3OuterLaneSpinMaxRotorSyncError = 0;
    let part3OuterLaneSpinPreviousSpeed = 0;
    let part3OuterLaneSpinRollingMismatchSum = 0;
    let part3OuterLaneSpinRollingSamples = 0;
    let part3OuterLaneSpinInwardTransitionTime: number | null = null;
    let part3OuterLaneSpinInwardTransitionRadius: number | null = null;
    let part3AlignmentRunning = false;
    let part3AlignmentFinished = false;
    let part3AlignmentMaxVisualBodySyncError = 0;
    let part3TrackVerticalOffset = 0;
    let part2RaceVerticalOffset = 0;
    let part3PocketRunning = false;
    let part3PocketElapsed = 0;
    let part3PocketPeakSpeed = 0;
    let part3PocketMaxPenetration = 0;
    let part3PocketMaxSeparation = 0;
    let part3PocketMaxRotorSyncError = 0;
    let part3PocketMaxVisualBodySyncError = 0;
    let part3PocketSettledFrames = 0;
    let part3PocketEntered = false;
    let part3PocketFretContact = false;
    let part3PocketFirstFretContactSpeed: number | null = null;
    let part3PocketBlockingColliderHandle: number | null = null;
    let part3PocketBlockingColliderType: string | null = null;
    let part3PocketBlockingContactTime: number | null = null;
    let part3PocketPreviousSpeed = 0;
    let part3PocketArtificialEnergyInjection = false;
    let part3PocketLeftValidVolume = false;
    let part3PocketTunneled = false;
    let part4ProbeIndex = 0;
    let part4Elapsed = 0;
    let part4PeakSpeed = 0;
    let part4InitialSpeed = 0;
    let part4MinRadius = Number.POSITIVE_INFINITY;
    let part4MaxRadius = 0;
    let part4MaxPenetration = 0;
    let part4MaxSeparation = 0;
    let part4ContactFrames = 0;
    let part4SampleFrames = 0;
    let part4MaxVisualBodySyncError = 0;
    let part4MaxRotorSyncError = 0;
    let part4MaxEnergyGain = 0;
    let part4OutsideTurretStationary = true;
    let part4LeftValidVolume = false;
    let part4Results: Part4ProbeResult[] = [];
    let part4Finished = false;
    let part3PocketReport: Part3PocketDescentReport | null = null;
    const stationaryBaselinePosition = new THREE.Vector3();
    const stationaryBaselineQuaternion = new THREE.Quaternion();

    callbacksRef.current.onStateChange('loading');

    const publishDropReport = (report: Part2DropReport) => {
      setDropReport(report);
    };

    const publishPart3Report = (
      status: Part3ValidationReport['status'],
      detail: string,
      results = part3Results,
    ) => {
      setPart3Report({
        status,
        results,
        pocketDescent: part3PocketReport,
        ccdEnabled,
        detail,
      });
    };

    const publishPart3AlignmentReport = (report: Part3AlignmentReport) => {
      setPart3AlignmentReport(report);
    };

    const publishPart3OuterLaneReport = (report: Part3OuterLaneReport) => {
      setPart3OuterLaneReport(report);
    };

    const publishPart3OuterLaneSpinReport = (
      report: Part3OuterLaneSpinReport,
    ) => {
      setPart3OuterLaneSpinReport(report);
    };

    const publishPart6TelemetryReport = (
      report: Part6FullSpinTelemetryReport,
    ) => {
      setPart6TelemetryReport(report);
    };

    const publishPart3GeometryDiagnosticReport = (
      report: Part3GeometryDiagnosticReport,
    ) => {
      setPart3GeometryDiagnosticReport(report);
    };

    const measureVisibleSurfaceAt = (
      x: number,
      z: number,
      darkTrackOnly = true,
      darkTrackBand: readonly [number, number] =
        PART3_DARK_TRACK_RADIUS_BAND,
    ) => {
      if (!stationaryGroup) return null;
      stationaryGroup.updateMatrixWorld(true);
      const sampleRadius = Math.hypot(x, z);
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(x, 1.5, z),
        new THREE.Vector3(0, -1, 0),
        0,
        4,
      );
      const intersections = raycaster.intersectObject(stationaryGroup, true);
      const hit = intersections
        .filter((intersection) => {
          const hitRadius = Math.hypot(intersection.point.x, intersection.point.z);
          const objectName = intersection.object.name;
          const material = (intersection.object as THREE.Mesh).material;
          const materialNames = Array.isArray(material)
            ? material.map((entry) => entry.name)
            : [material?.name];
          const isOutsideGeometry = objectName === 'geo1_outside_0';
          const isOutsideMaterial = materialNames.includes('outside');
          return (
            (!darkTrackOnly ||
              (sampleRadius >= darkTrackBand[0] &&
                sampleRadius <= darkTrackBand[1] &&
                hitRadius >= darkTrackBand[0] &&
                hitRadius <= darkTrackBand[1])) &&
            (isOutsideGeometry || isOutsideMaterial) &&
            intersection.point.y > -1.5 &&
            intersection.point.y < 1
          );
        })
        .sort((left, right) => right.point.y - left.point.y)[0];
      if (!hit) return null;
      const normal = hit.face
        ? hit.face.normal
            .clone()
            .transformDirection(
              new THREE.Matrix4().extractRotation(hit.object.matrixWorld),
            )
            .normalize()
        : new THREE.Vector3(0, 1, 0);
      const rayOrigin = new THREE.Vector3(x, 1.5, z);
      if (normal.dot(rayOrigin.sub(hit.point)) < 0) normal.negate();
      return {
        y: hit.point.y,
        source: hit.object.name || hit.object.parent?.name || 'unnamed-mesh',
        point: {
          x: hit.point.x,
          y: hit.point.y,
          z: hit.point.z,
        },
        normal: {
          x: normal.x,
          y: normal.y,
          z: normal.z,
        },
      };
    };

    const measureVisibleDeflectors = (): Part4DeflectorAudit => {
      const radialStep =
        (PART4_DEFLECTOR_SCAN_OUTER_RADIUS -
          PART4_DEFLECTOR_SCAN_INNER_RADIUS) /
        (PART4_DEFLECTOR_RADIAL_SAMPLE_COUNT - 1);
      const angularStep = TWO_PI / PART4_DEFLECTOR_AZIMUTH_SAMPLE_COUNT;
      const rows: Array<{
        radius: number;
        baseline: number;
        heights: number[];
      }> = [];

      for (
        let radialIndex = 0;
        radialIndex < PART4_DEFLECTOR_RADIAL_SAMPLE_COUNT;
        radialIndex += 1
      ) {
        const radius =
          PART4_DEFLECTOR_SCAN_INNER_RADIUS + radialIndex * radialStep;
        const heights = Array.from(
          { length: PART4_DEFLECTOR_AZIMUTH_SAMPLE_COUNT },
          (_, angleIndex) => {
            const angle = angleIndex * angularStep;
            const hit = measureVisibleSurfaceAt(
              Math.sin(angle) * radius,
              Math.cos(angle) * radius,
              false,
            );
            return hit?.y ?? Number.NaN;
          },
        );
        const valid = heights
          .filter((height) => Number.isFinite(height))
          .sort((left, right) => left - right);
        if (
          valid.length <
          Math.floor(PART4_DEFLECTOR_AZIMUTH_SAMPLE_COUNT * 0.8)
        ) {
          continue;
        }
        rows.push({
          radius,
          baseline: valid[Math.floor(valid.length / 2)],
          heights,
        });
      }

      if (rows.length < 3) {
        return {
          passed: false,
          descriptors: [],
          prominenceThreshold: PART4_DEFLECTOR_MIN_PROMINENCE,
          peakProminence: 0,
          maxSpacingDeviationRatio: null,
          detail:
            'Deflector audit failed: insufficient visible geo1_outside_0 samples in the bowl/inner-transition band.',
        };
      }

      const rawProminence = Array.from(
        { length: PART4_DEFLECTOR_AZIMUTH_SAMPLE_COUNT },
        (_, angleIndex) =>
          Math.max(
            0,
            ...rows.map((row) => {
              const height = row.heights[angleIndex];
              return Number.isFinite(height)
                ? height - row.baseline
                : Number.NEGATIVE_INFINITY;
            }),
          ),
      );
      const prominence = rawProminence.map((_, angleIndex) => {
        let sum = 0;
        let count = 0;
        for (let offset = -2; offset <= 2; offset += 1) {
          const sampleIndex =
            (angleIndex +
              offset +
              PART4_DEFLECTOR_AZIMUTH_SAMPLE_COUNT) %
            PART4_DEFLECTOR_AZIMUTH_SAMPLE_COUNT;
          const value = rawProminence[sampleIndex];
          if (Number.isFinite(value)) {
            sum += value;
            count += 1;
          }
        }
        return count > 0 ? sum / count : 0;
      });
      const peakProminence = Math.max(...prominence);
      const prominenceThreshold = Math.max(
        PART4_DEFLECTOR_MIN_PROMINENCE,
        peakProminence * 0.35,
      );
      const active = prominence.map(
        (value) => value >= prominenceThreshold,
      );
      const firstInactiveIndex = active.findIndex((value) => !value);
      if (firstInactiveIndex < 0 || !active.some(Boolean)) {
        return {
          passed: false,
          descriptors: [],
          prominenceThreshold,
          peakProminence,
          maxSpacingDeviationRatio: null,
          detail:
            'Deflector audit failed: angular prominence did not separate into discrete visible deflectors.',
        };
      }

      const clusters: number[][] = [];
      let current: number[] = [];
      for (
        let offset = 1;
        offset <= PART4_DEFLECTOR_AZIMUTH_SAMPLE_COUNT;
        offset += 1
      ) {
        const index =
          (firstInactiveIndex + offset) %
          PART4_DEFLECTOR_AZIMUTH_SAMPLE_COUNT;
        if (active[index]) {
          current.push(index);
        } else if (current.length > 0) {
          if (current.length >= PART4_DEFLECTOR_MIN_CLUSTER_SAMPLES) {
            clusters.push(current);
          }
          current = [];
        }
      }
      if (current.length >= PART4_DEFLECTOR_MIN_CLUSTER_SAMPLES) {
        clusters.push(current);
      }

      const descriptors = clusters
        .map((cluster): Part4VisibleDeflector | null => {
          let weightedSin = 0;
          let weightedCos = 0;
          let weightTotal = 0;
          for (const index of cluster) {
            const angle = index * angularStep;
            const weight = Math.max(
              PART4_DEFLECTOR_MIN_PROMINENCE,
              prominence[index],
            );
            weightedSin += Math.sin(angle) * weight;
            weightedCos += Math.cos(angle) * weight;
            weightTotal += weight;
          }
          if (weightTotal <= 0) return null;
          const angle = normalizedAngle(
            Math.atan2(
              weightedSin / weightTotal,
              weightedCos / weightTotal,
            ),
          );
          const supportingRows = rows.filter((row) => {
            const rowPeak = Math.max(
              ...cluster.map((index) => {
                const height = row.heights[index];
                return Number.isFinite(height)
                  ? height - row.baseline
                  : Number.NEGATIVE_INFINITY;
              }),
            );
            return rowPeak >= prominenceThreshold * 0.45;
          });
          if (supportingRows.length === 0) return null;
          const innerRadius = Math.max(
            PART4_DEFLECTOR_SCAN_INNER_RADIUS,
            supportingRows[0].radius - radialStep * 0.5,
          );
          const outerRadius = Math.min(
            PART4_DEFLECTOR_SCAN_OUTER_RADIUS,
            supportingRows[supportingRows.length - 1].radius +
              radialStep * 0.5,
          );
          const topY = Math.max(
            ...supportingRows.flatMap((row) =>
              cluster
                .map((index) => row.heights[index])
                .filter((height) => Number.isFinite(height)),
            ),
          );
          const sortedBaselines = supportingRows
            .map((row) => row.baseline)
            .sort((left, right) => left - right);
          const bottomY =
            sortedBaselines[Math.floor(sortedBaselines.length / 2)];
          if (
            !Number.isFinite(topY) ||
            !Number.isFinite(bottomY) ||
            topY - bottomY < PART4_DEFLECTOR_MIN_PROMINENCE
          ) {
            return null;
          }
          return {
            angle,
            angularWidth: Math.max(
              angularStep * PART4_DEFLECTOR_MIN_CLUSTER_SAMPLES,
              cluster.length * angularStep,
            ),
            innerRadius,
            outerRadius,
            bottomY,
            topY,
            peakProminence: Math.max(
              ...cluster.map((index) => prominence[index]),
            ),
          };
        })
        .filter(
          (descriptor): descriptor is Part4VisibleDeflector =>
            descriptor !== null,
        )
        .sort((left, right) => left.angle - right.angle);

      const spacing =
        descriptors.length > 1
          ? descriptors.map((descriptor, index) => {
              const next =
                descriptors[(index + 1) % descriptors.length];
              return normalizedAngle(next.angle - descriptor.angle);
            })
          : [];
      const expectedSpacing =
        descriptors.length > 1 ? TWO_PI / descriptors.length : 0;
      const maxSpacingDeviationRatio =
        spacing.length > 0 && expectedSpacing > 0
          ? Math.max(
              ...spacing.map(
                (value) =>
                  Math.abs(value - expectedSpacing) / expectedSpacing,
              ),
            )
          : null;
      const passed =
        descriptors.length >= PART4_DEFLECTOR_MIN_COUNT &&
        descriptors.length <= PART4_DEFLECTOR_MAX_COUNT &&
        peakProminence >= PART4_DEFLECTOR_MIN_PROMINENCE &&
        maxSpacingDeviationRatio !== null &&
        maxSpacingDeviationRatio <= 0.35;

      return {
        passed,
        descriptors,
        prominenceThreshold,
        peakProminence,
        maxSpacingDeviationRatio,
        detail: passed
          ? `PASS: measured ${descriptors.length} discrete visible deflectors directly from geo1_outside_0.`
          : `Deflector audit failed: measured ${descriptors.length} candidate clusters; spacing/prominence sanity check did not pass.`,
      };
    };

    const measureBowlBridgeProfile = (
      channelVerticalOffset: number,
      outerRadius: number = BOWL_BRIDGE_OUTER_RADIUS,
    ): Array<[number, number]> => {
      const radii = Array.from(
        { length: BOWL_BRIDGE_SAMPLE_COUNT },
        (_, index) =>
          THREE.MathUtils.lerp(
            BOWL_BRIDGE_INNER_RADIUS,
            outerRadius,
            index / (BOWL_BRIDGE_SAMPLE_COUNT - 1),
          ),
      );
      const sampleAzimuths = [0.37, 2.464, 4.558];
      const measured = radii.map((radius) => {
        const heights = sampleAzimuths
          .map((azimuth) => {
            const hit = measureVisibleSurfaceAt(
              Math.sin(azimuth) * radius,
              Math.cos(azimuth) * radius,
              false,
            );
            return hit?.y ?? null;
          })
          .filter((value): value is number => value !== null)
          .sort((left, right) => left - right);
        return heights.length > 0
          ? heights[Math.floor(heights.length / 2)]
          : null;
      });

      const targetOuterY = part2ChannelSurfaceAt(
        outerRadius,
        channelVerticalOffset,
      ).y;
      // For the full-spin route the apron must descend toward the rotor.
      // A higher inner lip turns this transition into a launch ramp at speed.
      const targetInnerY = part6FullSpinRouteActive
        ? Math.min(
            POCKET_OUTER_LIP_Y,
            targetOuterY - BALL_RADIUS * 0.75,
          )
        : POCKET_OUTER_LIP_Y;
      const measuredInnerY = measured[0] ?? null;
      const measuredOuterY = measured[measured.length - 1] ?? null;
      const canAlignMeasuredProfile =
        measuredInnerY !== null &&
        measuredOuterY !== null &&
        Number.isFinite(measuredInnerY) &&
        Number.isFinite(measuredOuterY);

      return radii.map((radius, index) => {
        const alpha = index / (radii.length - 1);
        const fallbackY = THREE.MathUtils.lerp(
          targetInnerY,
          targetOuterY,
          alpha,
        );
        if (index === 0) return [radius, targetInnerY];
        if (index === radii.length - 1) return [radius, targetOuterY];
        const visibleY = measured[index];
        if (!canAlignMeasuredProfile || visibleY == null) {
          return [radius, fallbackY];
        }
        const seamCorrection = THREE.MathUtils.lerp(
          targetInnerY - measuredInnerY!,
          targetOuterY - measuredOuterY!,
          alpha,
        );
        const correctedY = visibleY + seamCorrection;
        const envelopeMin = Math.min(targetInnerY, targetOuterY) - 0.04;
        const envelopeMax = Math.max(targetInnerY, targetOuterY) + 0.04;
        return [
          radius,
          THREE.MathUtils.clamp(correctedY, envelopeMin, envelopeMax),
        ];
      });
    };

    const measureVisibleOuterWallProfile = () => {
      if (!stationaryGroup) return [];
      stationaryGroup.updateMatrixWorld(true);
      const azimuth = 0.37;
      const radialDirection = new THREE.Vector3(
        Math.sin(azimuth),
        0,
        Math.cos(azimuth),
      );
      const sampleHeights = [
        -0.36,
        -0.32,
        -0.28,
        -0.24,
        -0.2,
        -0.16,
        -0.12,
        -0.08,
        -0.04,
        0,
        0.04,
        0.08,
        0.12,
        0.16,
        0.2,
        0.24,
      ];
      const profile: Array<[number, number]> = [];
      for (const height of sampleHeights) {
        const raycaster = new THREE.Raycaster(
          new THREE.Vector3(
            Math.sin(azimuth) * 2.18,
            height,
            Math.cos(azimuth) * 2.18,
          ),
          radialDirection,
          0,
          0.55,
        );
        const hit = raycaster
          .intersectObject(stationaryGroup, true)
          .filter((intersection) => {
            const hitRadius = Math.hypot(
              intersection.point.x,
              intersection.point.z,
            );
            const mesh = intersection.object as THREE.Mesh;
            const material = Array.isArray(mesh.material)
              ? mesh.material[intersection.face?.materialIndex ?? 0]
              : mesh.material;
            const isOutside =
              mesh.name === 'geo1_outside_0' ||
              material?.name === 'outside';
            const inwardFacing = intersection.face
              ? intersection.face.normal
                  .clone()
                  .transformDirection(
                    new THREE.Matrix4().extractRotation(mesh.matrixWorld),
                  )
                  .dot(radialDirection) < -0.05
              : true;
            return (
              isOutside &&
              inwardFacing &&
              hitRadius >= PART2_ACTUAL_WOOD_INNER_RADIUS - 0.01 &&
              hitRadius <= 2.58
            );
          })
          .sort((left, right) => left.distance - right.distance)[0];
        if (hit) {
          profile.push([
            Number(Math.hypot(hit.point.x, hit.point.z).toFixed(4)),
            Number(height.toFixed(4)),
          ]);
        }
      }
      return profile;
    };

    const measureVisibleInnerTransitionProfile = () => {
      if (!stationaryGroup) return [];
      stationaryGroup.updateMatrixWorld(true);
      const azimuth = 0.37;
      const radialDirection = new THREE.Vector3(
        Math.sin(azimuth),
        0,
        Math.cos(azimuth),
      );
      const sampleHeights = [
        -0.39,
        -0.37,
        -0.35,
        -0.33,
        -0.31,
        -0.29,
        -0.27,
        -0.25,
        -0.23,
        -0.21,
      ];
      const profile: Array<[number, number]> = [];
      for (const height of sampleHeights) {
        const raycaster = new THREE.Raycaster(
          new THREE.Vector3(
            Math.sin(azimuth) * 1.95,
            height,
            Math.cos(azimuth) * 1.95,
          ),
          radialDirection,
          0,
          0.45,
        );
        const hit = raycaster
          .intersectObject(stationaryGroup, true)
          .filter((intersection) => {
            const hitRadius = Math.hypot(
              intersection.point.x,
              intersection.point.z,
            );
            const mesh = intersection.object as THREE.Mesh;
            const material = Array.isArray(mesh.material)
              ? mesh.material[intersection.face?.materialIndex ?? 0]
              : mesh.material;
            const isOutside =
              mesh.name === 'geo1_outside_0' ||
              material?.name === 'outside';
            return (
              isOutside &&
              hitRadius >= 2.14 &&
              hitRadius <= 2.30
            );
          })
          .sort((left, right) => left.distance - right.distance)[0];
        if (hit) {
          profile.push([
            Number(Math.hypot(hit.point.x, hit.point.z).toFixed(4)),
            Number(height.toFixed(4)),
          ]);
        }
      }
      return profile;
    };

    const measureVisibleInnerSurfaceProfile = () => {
      const sampleRadii = [
        2.18,
        2.2,
        2.22,
        2.24,
        2.26,
        2.27,
        2.28,
        2.3,
      ];
      const profile: Array<[number, number]> = [];
      for (const radius of sampleRadii) {
        const sample = measureVisibleSurfaceAt(
          Math.sin(0.37) * radius,
          Math.cos(0.37) * radius,
          false,
          [2.14, 2.32],
        );
        if (sample) {
          profile.push([
            Number(radius.toFixed(4)),
            Number(sample.y.toFixed(4)),
          ]);
        }
      }
      return profile;
    };


    const measureVisibleOuterRaceFloorProfile = () => {
      const profile: Array<{
        radius: number;
        y: number;
        normal: VectorReadout;
      }> = [];
      for (
        let radius = PART2_ACTUAL_DARK_TRACK_RADIUS_BAND[0];
        radius <= PART2_ACTUAL_DARK_TRACK_RADIUS_BAND[1] + 0.0001;
        radius += 0.01
      ) {
        const azimuth = 0.37;
        const sample = measureVisibleSurfaceAt(
          Math.sin(azimuth) * radius,
          Math.cos(azimuth) * radius,
          true,
          PART2_ACTUAL_DARK_TRACK_RADIUS_BAND,
        );
        if (!sample) continue;
        profile.push({
          radius: Number(radius.toFixed(4)),
          y: Number(sample.y.toFixed(4)),
          normal: {
            x: Number(sample.normal.x.toFixed(4)),
            y: Number(sample.normal.y.toFixed(4)),
            z: Number(sample.normal.z.toFixed(4)),
          },
        });
      }
      return profile;
    };

    const sampleActualGeometryProfile = () => {
      if (!stationaryGroup) return [];
      stationaryGroup.updateMatrixWorld(true);
      rotorPivot?.updateMatrixWorld(true);
      const samples: Part3GeometryProfileSample[] = [];
      const azimuths = [0.37, 0.37 + POCKET_STEP_RADIANS * 0.5];
      for (const azimuth of azimuths) {
        for (
          let radius = 0.2;
          radius <= 3.15 + 0.0001;
          radius += 0.01
        ) {
          const raycaster = new THREE.Raycaster(
            new THREE.Vector3(
              Math.sin(azimuth) * radius,
              2,
              Math.cos(azimuth) * radius,
            ),
            new THREE.Vector3(0, -1, 0),
            0,
            4,
          );
          const intersections = [
            ...raycaster.intersectObject(stationaryGroup, true),
            ...(rotorPivot
              ? raycaster.intersectObject(rotorPivot, true)
              : []),
          ];
          const hits = intersections
            .map((intersection) => {
              const mesh = intersection.object as THREE.Mesh;
              const faceNormal = intersection.face?.normal
                ? intersection.face.normal
                    .clone()
                    .transformDirection(mesh.matrixWorld)
                : new THREE.Vector3(0, 0, 0);
              const material = Array.isArray(mesh.material)
                ? mesh.material[intersection.face?.materialIndex ?? 0]
                : mesh.material;
              return {
                y: intersection.point.y,
                objectName: mesh.name || mesh.parent?.name || 'unnamed-mesh',
                materialName: material?.name || 'unnamed-material',
                normalY: faceNormal.y,
              };
            })
            .filter(
              (hit) =>
                hit.normalY > 0.2 &&
                hit.y > -1.5 &&
                hit.y < 1.5,
            )
            .sort((left, right) => right.y - left.y);
          if (hits.length > 0) {
            samples.push({
              azimuth,
              radius: Number(radius.toFixed(4)),
              hits: hits.map((hit) => ({
                y: Number(hit.y.toFixed(4)),
                objectName: hit.objectName,
                materialName: hit.materialName,
                normalY: Number(hit.normalY.toFixed(4)),
              })),
            });
          }
        }
      }
      return samples;
    };

    const startPart3AlignmentProbe = () => {
      if (!ballBody || !ballMesh) return;
      const radius = PART3_LAUNCH_RADIUS;
      const azimuth = 0.37;
      const channelSurface = part2ChannelSurfaceAt(
        radius,
        part3TrackVerticalOffset,
      );
      const channelNormal = part2ChannelNormalAt(radius, azimuth);
      const positionVector = new THREE.Vector3(
        ...radialPosition(radius, azimuth, channelSurface.y),
      ).addScaledVector(channelNormal, BALL_RADIUS + 0.002);
      const position: [number, number, number] = [
        positionVector.x,
        positionVector.y,
        positionVector.z,
      ];
      const velocityVector = new THREE.Vector3(
        Math.cos(azimuth),
        0,
        -Math.sin(azimuth),
      )
        .projectOnPlane(channelNormal)
        .normalize()
        .multiplyScalar(PART3_ALIGNMENT_PROBE_SPEED);
      const velocity = {
        x: velocityVector.x,
        y: velocityVector.y,
        z: velocityVector.z,
      };
      const visibleSurface = measureVisibleSurfaceAt(
        position[0],
        position[2],
        true,
        PART2_ACTUAL_DARK_TRACK_RADIUS_BAND,
      );
      const analyticContactY = channelSurface.y;
      ballBody.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
      ballBody.setLinvel(velocity, true);
      ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ballMesh.position.set(...position);
      ballMesh.quaternion.identity();
      part3AlignmentRunning = true;
      part3AlignmentFinished = false;
      part3Elapsed = 0;
      part3AlignmentMaxVisualBodySyncError = 0;
      publishPart3AlignmentReport({
        status: 'running',
        sampleRadius: radius,
        sampleAzimuth: azimuth,
        visibleSurfaceY: visibleSurface?.y ?? null,
        visibleSurfaceSource: visibleSurface?.source ?? null,
        darkTrackRadiusBand: PART3_DARK_TRACK_RADIUS_BAND,
        analyticColliderContactYBefore:
          part3TrackHeight(radius, part3TrackVerticalOffset),
        analyticColliderContactYAfter: analyticContactY,
        rigidBodyCenterY: position[1],
        ballBottomY: position[1] - BALL_RADIUS,
        ballRadius: BALL_RADIUS,
        signedVerticalMismatch:
          visibleSurface === null
            ? null
            : position[1] - BALL_RADIUS - visibleSurface.y,
        signedColliderContactMismatch: position[1] - BALL_RADIUS - analyticContactY,
        woodRetainingRingContact:
          radius + BALL_RADIUS >= PART3_RETAINING_RIM_INNER_RADIUS - 0.005,
        visuallyInsideWheelBody:
          visibleSurface !== null &&
          position[1] - BALL_RADIUS < visibleSurface.y - 0.005,
        physicalContact: false,
        hover: false,
        passThrough: false,
        tunneling: false,
        maxVisualBodySyncError: 0,
        detail: 'Measuring one short outer-track visual/physics alignment probe…',
      });
    };

    const startPart3OuterLaneProbe = () => {
      if (!ballBody || !ballMesh) return;
      const launchAzimuth = 0.37;
      const darkTrackInnerRadius = PART2_ACTUAL_DARK_TRACK_RADIUS_BAND[0];
      const darkTrackOuterRadius = PART2_ACTUAL_DARK_TRACK_RADIUS_BAND[1];
      const retainingRimInnerRadius = PART2_ACTUAL_WOOD_INNER_RADIUS;
      const nearestDeflectorOuterRadius =
        part4MeasuredDeflectorOuterRadius ??
        PART2_ACTUAL_INWARD_EDGE_RADIUS;
      const chosenLaunchRadius = PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS;
      const channelSurface = part2ChannelSurfaceAt(
        chosenLaunchRadius,
        part2RaceVerticalOffset,
      );
      const launchPositionVector = new THREE.Vector3(
        ...radialPosition(
          chosenLaunchRadius,
          launchAzimuth,
          channelSurface.y,
        ),
      ).addScaledVector(
        part2ChannelNormalAt(chosenLaunchRadius, launchAzimuth),
        BALL_RADIUS + 0.002,
      );
      const launchPosition: [number, number, number] = [
        launchPositionVector.x,
        launchPositionVector.y,
        launchPositionVector.z,
      ];
      const initialLinearSpeed = PART3_PROBES[0].speed;
      const launchNormal = part2ChannelNormalAt(
        chosenLaunchRadius,
        launchAzimuth,
      );
      const initialVelocityVector = new THREE.Vector3(
        Math.cos(launchAzimuth),
        0,
        -Math.sin(launchAzimuth),
      )
        .projectOnPlane(launchNormal)
        .normalize()
        .multiplyScalar(initialLinearSpeed);
      const initialVelocity = {
        x: initialVelocityVector.x,
        y: initialVelocityVector.y,
        z: initialVelocityVector.z,
      };
      const initialAngularSpin = {
        x: Number(
          ((launchNormal.z * initialVelocityVector.y -
            launchNormal.y * initialVelocityVector.z) /
            BALL_RADIUS).toFixed(4),
        ),
        y: Number(
          ((launchNormal.x * initialVelocityVector.z -
            launchNormal.z * initialVelocityVector.x) /
            BALL_RADIUS).toFixed(4),
        ),
        z: Number(
          ((launchNormal.y * initialVelocityVector.x -
            launchNormal.x * initialVelocityVector.y) /
            BALL_RADIUS).toFixed(4),
        ),
      };
      part3OuterLaneRunning = true;
      part3OuterLaneElapsed = 0;
      part3OuterLaneLaunchRadius = chosenLaunchRadius;
      part3OuterLaneLaunchAzimuth = launchAzimuth;
      part3OuterLaneLaunchHeight = launchPosition[1];
      part3OuterLaneInitialVelocity = initialVelocity;
      part3OuterLaneInitialLinearSpeed = initialLinearSpeed;
      part3OuterLaneInitialAngularSpin = initialAngularSpin;
      part3OuterLanePeakSpeed = initialLinearSpeed;
      part3OuterLaneInitialRadius = Math.hypot(
        launchPosition[0],
        launchPosition[2],
      );
      part3OuterLaneMinRadius = chosenLaunchRadius;
      part3OuterLaneMaxRadius = chosenLaunchRadius;
      part3OuterLaneMinRimClearance =
        retainingRimInnerRadius - BALL_RADIUS - chosenLaunchRadius;
      part3OuterLaneMinDeflectorClearance =
        chosenLaunchRadius - BALL_RADIUS - nearestDeflectorOuterRadius;
      part3OuterLaneTrackContactFrames = 0;
      part3OuterLaneSampleFrames = 0;
      part3OuterLaneMaxPenetration = 0;
      part3OuterLaneMaxSeparation = 0;
      part3OuterLaneDeflectorContact = false;
      part3OuterLaneWoodContact = false;
      part3OuterLaneHover = false;
      part3OuterLaneClipping = false;
      part3OuterLaneTunneling = false;
      part3OuterLaneEscaped = false;
      part3OuterLaneVelocitySpike = false;
      part3OuterLaneMaxVisualBodySyncError = 0;
      ballBody.setTranslation(
        { x: launchPosition[0], y: launchPosition[1], z: launchPosition[2] },
        true,
      );
      ballBody.setLinvel(initialVelocity, true);
      ballBody.setAngvel(initialAngularSpin, true);
      ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ballMesh.position.set(...launchPosition);
      ballMesh.quaternion.identity();
      publishPart3OuterLaneReport({
        status: 'running',
        darkTrackInnerRadius,
        darkTrackOuterRadius,
        retainingRimInnerRadius,
        nearestDeflectorOuterRadius,
        ballRadius: BALL_RADIUS,
        chosenLaunchRadius,
        radialClearanceToRim:
          retainingRimInnerRadius - BALL_RADIUS - chosenLaunchRadius,
        radialClearanceToDeflector:
          chosenLaunchRadius - BALL_RADIUS - nearestDeflectorOuterRadius,
        outerTrackEdgeClearance:
          darkTrackOuterRadius - BALL_RADIUS - chosenLaunchRadius,
        launchAzimuth,
        launchHeight: launchPosition[1],
        tangentialLaunchDirection: {
          x: Number((initialVelocity.x / initialLinearSpeed).toFixed(4)),
          y: 0,
          z: Number((initialVelocity.z / initialLinearSpeed).toFixed(4)),
        },
        initialLinearSpeed,
        initialAngularSpin,
        floorContactNormal: roundedVector(launchNormal),
        outerWallContactNormal: roundedVector(
          new THREE.Vector3(
            -Math.sin(launchAzimuth),
            0,
            -Math.cos(launchAzimuth),
          ),
        ),
        peakSpeed: initialLinearSpeed,
        inwardRadialDrift: 0,
        minRadius: chosenLaunchRadius,
        maxRadius: chosenLaunchRadius,
        minRimClearance: part3OuterLaneMinRimClearance,
        minDeflectorClearance: part3OuterLaneMinDeflectorClearance,
        innerContainmentRadius: PART2_INNER_CONTAINMENT_RADIUS,
        innerContainmentCenterLimit: PART2_INNER_CONTAINMENT_CENTER_LIMIT,
        minimumInnerContainmentClearance:
          chosenLaunchRadius - PART2_INNER_CONTAINMENT_CENTER_LIMIT,
        staysOnOuterDarkLane: false,
        prematureDeflectorContact: false,
        woodContact: false,
        hover: false,
        clipping: false,
        tunneling: false,
        escaped: false,
        velocitySpike: false,
        maxVisualBodySyncError: 0,
        maxPenetration: 0,
        maxSeparation: 0,
        physicalTrackContact: false,
         detail: `Running one ${PART3_OUTER_LANE_PROBE_DURATION_SECONDS.toFixed(2)} s short tangential probe inside the measured recessed channel; no lap target is being evaluated.`,
      });
    };

    const runPart2RaceStaticPlacementCheck = () => {
      if (!world || !ballBody || !ballMesh || !part3TrackCollider) return;
      const part6RouteDiagnostic =
        outerLaneSpinOnly &&
        (new URLSearchParams(window.location.search).has('part6SeedCount') ||
          new URLSearchParams(window.location.search).has(
            'part6MaxDurationSeconds',
          ));
      const logStaticGateStage = (
        stage: string,
        extra: Record<string, number | string | boolean | null> = {},
      ) => {
        if (!part6RouteDiagnostic) return;
        console.info(
          'PART6_DIAGNOSTIC_STAGE',
          JSON.stringify({ stage, ...extra }),
        );
      };
      logStaticGateStage('static-gate-start');
      const launchAzimuth = 0.37;
      const spawnRadius = PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS;
      const surface = part2ChannelSurfaceAt(spawnRadius, part2RaceVerticalOffset);
      const contactNormal = part2ChannelNormalAt(spawnRadius, launchAzimuth);
      const spawnPoint = new THREE.Vector3(
        ...radialPosition(spawnRadius, launchAzimuth, surface.y),
      ).addScaledVector(contactNormal, BALL_RADIUS + 0.002);
      logStaticGateStage('visible-surface-before');
      const visibleSurface = measureVisibleSurfaceAt(
        spawnPoint.x,
        spawnPoint.z,
        true,
        PART2_ACTUAL_DARK_TRACK_RADIUS_BAND,
      );
      logStaticGateStage('visible-surface-after', {
        found: Boolean(visibleSurface),
      });
      logStaticGateStage('inner-transition-profile-before');
      const visibleInnerTransitionProfile =
        measureVisibleInnerTransitionProfile();
      logStaticGateStage('inner-transition-profile-after', {
        samples: visibleInnerTransitionProfile.length,
      });
      logStaticGateStage('inner-surface-profile-before');
      const visibleInnerSurfaceProfile = measureVisibleInnerSurfaceProfile();
      logStaticGateStage('inner-surface-profile-after', {
        samples: visibleInnerSurfaceProfile.length,
      });
      logStaticGateStage('outer-wall-profile-before');
      const visibleOuterWallProfile = measureVisibleOuterWallProfile();
      logStaticGateStage('outer-wall-profile-after', {
        samples: visibleOuterWallProfile.length,
      });
      if (part6FullSpinRouteActive) {
        console.info(
          'PART6_ACTUAL_RACE_PROFILE',
          JSON.stringify(measureVisibleOuterRaceFloorProfile()),
        );
      }
      const analyticSurfaceY = surface.y;
      const visualHeightError = visibleSurface
        ? Math.abs(visibleSurface.y - analyticSurfaceY)
        : Number.POSITIVE_INFINITY;
      const liveRendererAvailable = renderer !== null;
      const centerFloorEnvelope: readonly [number, number] = [
        PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_INNER_INDEX][0] +
          BALL_RADIUS,
        PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_OUTER_INDEX][0] -
          BALL_RADIUS,
      ];
      const provisionalCenterRadius = Math.hypot(
        spawnPoint.x,
        spawnPoint.z,
      );
      const provisionalBallBottom = spawnPoint
        .clone()
        .addScaledVector(contactNormal, -BALL_RADIUS);
      const provisionalNearestFloorRadius = THREE.MathUtils.clamp(
        provisionalCenterRadius,
        PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_INNER_INDEX][0],
        PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_OUTER_INDEX][0],
      );
      const provisionalNearestFloorSurface = part2ChannelSurfaceAt(
        provisionalNearestFloorRadius,
        part2RaceVerticalOffset,
      );
      const provisionalNearestFloorPoint = new THREE.Vector3(
        ...radialPosition(
          provisionalNearestFloorRadius,
          launchAzimuth,
          provisionalNearestFloorSurface.y,
        ),
      );
      const disabledColliders = [
        'actual-glb-outside-trimesh (disabled for physics)',
        'outer-track-support-trimesh (broad annular support disabled)',
        'visible-deflector-cuboid (not active in short race probe)',
      ];
      const activeRaceCollider =
        part3ColliderRoles.get(part3TrackCollider.handle) ?? 'unknown';
      const actualGlbRaceActive =
        part6FullSpinRouteActive &&
        activeRaceCollider === 'actual-glb-outside-trimesh';
      const broadSupportActive = [...part3ColliderRoles.values()].some(
        (role) =>
          role === 'outer-track-support-trimesh' ||
          (role === 'actual-glb-outside-trimesh' && !actualGlbRaceActive),
      );
      logStaticGateStage('static-report-before');
      setPart2RacePlacementReport({
        status: 'running',
        channelInnerRadius: PART2_CHANNEL_PROFILE[0][0],
        channelOuterRadius: PART2_CHANNEL_PROFILE.at(-1)![0],
        visibleInnerTransitionProfile,
        visibleInnerSurfaceProfile,
        analyticInnerTransitionProfile: PART2_CHANNEL_PROFILE.slice(
          0,
          PART2_CHANNEL_FLOOR_INNER_INDEX + 1,
        ).map(
          ([radius, y]) =>
            [radius, Number((y + part2RaceVerticalOffset).toFixed(4))] as [
              number,
              number,
            ],
        ),
        visibleOuterWallProfile,
        analyticOuterWallProfile: PART2_CHANNEL_PROFILE.slice(
          PART2_CHANNEL_FLOOR_OUTER_INDEX,
        ).map(
          ([radius, y]) =>
            [radius, Number((y + part2RaceVerticalOffset).toFixed(4))] as [
              number,
              number,
            ],
        ),
        runningSurfaceYRange: [
          PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_INNER_INDEX][1] +
            part2RaceVerticalOffset,
          PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_OUTER_INDEX][1] +
            part2RaceVerticalOffset,
        ],
        runningSurfaceSlope: [
          (PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_INNER_INDEX + 1][1] -
            PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_INNER_INDEX][1]) /
            (PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_INNER_INDEX + 1][0] -
              PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_INNER_INDEX][0]),
          (PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_OUTER_INDEX][1] -
            PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_OUTER_INDEX - 1][1]) /
            (PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_OUTER_INDEX][0] -
              PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_OUTER_INDEX - 1][0]),
        ],
        outerWallY: PART2_CHANNEL_PROFILE.at(-1)![1] + part2RaceVerticalOffset,
        innerTransitionY:
          PART2_CHANNEL_PROFILE[0][1] + part2RaceVerticalOffset,
        disabledColliders,
        activeRaceCollider,
        spawnRadius: Math.hypot(spawnPoint.x, spawnPoint.z),
        spawnHeight: spawnPoint.y,
        contactNormal: roundedVector(contactNormal),
        ballBottomContactPoint: roundedVector(provisionalBallBottom),
        ballBottomContactRadius: Math.hypot(
          provisionalBallBottom.x,
          provisionalBallBottom.z,
        ),
        ballBottomContactY: provisionalBallBottom.y,
        nearestFloorPoint: roundedVector(provisionalNearestFloorPoint),
        nearestFloorRadius: provisionalNearestFloorRadius,
        nearestFloorY: provisionalNearestFloorSurface.y,
        centerFloorEnvelope,
        centerInsideFloorEnvelope:
          provisionalCenterRadius >= centerFloorEnvelope[0] &&
          provisionalCenterRadius <= centerFloorEnvelope[1],
        innerTransitionDistance:
          provisionalCenterRadius -
          PART2_INNER_CONTAINMENT_CENTER_LIMIT,
        outerWallDistance:
          PART2_CHANNEL_PROFILE[PART2_CHANNEL_OUTER_WALL_FOOT_INDEX][0] -
          BALL_RADIUS -
          provisionalCenterRadius,
        contactColliderHandle: null,
        contactColliderType: activeRaceCollider,
        minRadius: Math.hypot(spawnPoint.x, spawnPoint.z),
        maxRadius: Math.hypot(spawnPoint.x, spawnPoint.z),
        physicalContact: false,
        visibleSurfaceMatch: false,
        numericPlacementPassed: false,
        visualGateVerified: false,
        onWoodTop: false,
        broadSupportActive,
        hover: false,
        detail: 'Static placement check is running before the tangential probe.',
      });

      ballBody.setTranslation(
        { x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z },
        true,
      );
      ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ballMesh.position.copy(spawnPoint);
      ballMesh.quaternion.identity();
      logStaticGateStage('static-world-step-before');
      world.step();
      logStaticGateStage('static-world-step-after');

      const position = ballBody.translation();
      let physicalContact = false;
      const raceColliderHandle = part3TrackCollider.handle;
      logStaticGateStage('static-contact-query-before');
      if (physicsBallCollider) {
        world.contactPairsWith(physicsBallCollider, (otherCollider) => {
          physicalContact ||= otherCollider.handle === raceColliderHandle;
        });
      }
      logStaticGateStage('static-contact-query-after', {
        physicalContact,
      });
      const centerRadius = Math.hypot(position.x, position.z);
      const centerSurface = part2ChannelSurfaceAt(
        centerRadius,
        part2RaceVerticalOffset,
      );
      const bottomGap = position.y - BALL_RADIUS - centerSurface.y;
      const ballBottomContactPoint = new THREE.Vector3(
        position.x,
        position.y,
        position.z,
      ).addScaledVector(contactNormal, -BALL_RADIUS);
      const ballBottomContactRadius = Math.hypot(
        ballBottomContactPoint.x,
        ballBottomContactPoint.z,
      );
      const nearestFloorRadius = THREE.MathUtils.clamp(
        centerRadius,
        PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_INNER_INDEX][0],
        PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_OUTER_INDEX][0],
      );
      const nearestFloorSurface = part2ChannelSurfaceAt(
        nearestFloorRadius,
        part2RaceVerticalOffset,
      );
      const nearestFloorPoint = new THREE.Vector3(
        ...radialPosition(
          nearestFloorRadius,
          launchAzimuth,
          nearestFloorSurface.y,
        ),
      );
      const lateralContainment =
        centerRadius >=
          PART2_INNER_CONTAINMENT_CENTER_LIMIT &&
        centerRadius <=
          PART2_CHANNEL_PROFILE[PART2_CHANNEL_OUTER_WALL_FOOT_INDEX][0] -
            BALL_RADIUS;
      const centerInsideFloorEnvelope =
        centerRadius >= centerFloorEnvelope[0] &&
        centerRadius <= centerFloorEnvelope[1];
      const onWoodTop =
        centerRadius + BALL_RADIUS >= PART2_ACTUAL_WOOD_INNER_RADIUS - 0.005;
      const hover =
        !physicalContact ||
        bottomGap > 0.03 ||
        !lateralContainment;
      const visibleSurfaceMatch =
        liveRendererAvailable &&
        visibleSurface !== null &&
        visualHeightError <= 0.03 &&
        visibleSurface.y > -1.5 &&
        visibleSurface.y < 1;
      const authorizedRaceCollider =
        activeRaceCollider === 'analytic-dark-recessed-channel' ||
        actualGlbRaceActive;
      const numericPlacementPassed =
        authorizedRaceCollider &&
        !broadSupportActive &&
        physicalContact &&
        centerInsideFloorEnvelope &&
        lateralContainment &&
        !onWoodTop &&
        !hover &&
        bottomGap >= -0.03;
      const visualGateVerified = visibleSurfaceMatch;
      const passed = numericPlacementPassed && visualGateVerified;
      logStaticGateStage('static-gate-evaluated', {
        numericPlacementPassed,
        visualGateVerified,
        physicalContact,
      });
      ballMesh.position.set(position.x, position.y, position.z);
      const rotation = ballBody.rotation();
      ballMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      setPart2RacePlacementReport((previous) =>
        previous
          ? {
              ...previous,
               status: passed
                 ? 'passed'
                 : numericPlacementPassed
                   ? 'running'
                   : 'failed',
              spawnRadius: centerRadius,
              spawnHeight: position.y,
               ballBottomContactPoint: roundedVector(ballBottomContactPoint),
               ballBottomContactRadius,
               ballBottomContactY: ballBottomContactPoint.y,
               nearestFloorPoint: roundedVector(nearestFloorPoint),
               nearestFloorRadius,
               nearestFloorY: nearestFloorSurface.y,
               centerInsideFloorEnvelope,
               innerTransitionDistance:
                 centerRadius -
          PART2_INNER_CONTAINMENT_CENTER_LIMIT,
               outerWallDistance:
          PART2_CHANNEL_PROFILE[PART2_CHANNEL_OUTER_WALL_FOOT_INDEX][0] -
                 BALL_RADIUS -
                 centerRadius,
               contactColliderHandle: physicalContact
                 ? raceColliderHandle
                 : null,
               contactColliderType: activeRaceCollider,
              minRadius: centerRadius,
              maxRadius: centerRadius,
              physicalContact,
              visibleSurfaceMatch,
               numericPlacementPassed,
               visualGateVerified,
              onWoodTop,
              hover,
               detail: passed
                ? 'PASS: the live ball placement is inside the measured recessed dark race with analytic contact.'
                 : numericPlacementPassed
                   ? 'NUMERIC STATIC PASS: ball is inside the analytic recessed race; visual WebGL gate is unverified, so the short numerical probe will run and the overall gate will remain incomplete.'
                : `FAIL: static channel gate failed (${[
                    !authorizedRaceCollider
                      ? 'wrong active collider'
                      : '',
                    broadSupportActive ? 'broad support active' : '',
                    !physicalContact ? 'no Rapier contact' : '',
                    !visualGateVerified ? 'visible GLB gate unverified' : '',
                    !centerInsideFloorEnvelope
                      ? 'ball center outside floor envelope'
                      : '',
                    !liveRendererAvailable
                      ? 'live renderer unavailable; screenshot-visible gate cannot pass'
                      : '',
                    !lateralContainment ? 'outside channel walls' : '',
                    onWoodTop ? 'on wood/top surface' : '',
                    hover ? 'hovering' : '',
                  ]
                    .filter(Boolean)
                    .join(', ') || 'review required'}).`,
            }
          : previous,
      );
      callbacksRef.current.onStateChange(
        numericPlacementPassed ? 'loaded' : 'error',
        passed
          ? 'PART 2 recessed dark-race static placement passed'
          : numericPlacementPassed
            ? 'PART 2 recessed dark-race static placement numerically passed; visual gate unavailable'
            : 'PART 2 recessed dark-race static placement failed',
        numericPlacementPassed ? undefined : 'physics-validation',
      );
      if (numericPlacementPassed) {
        if (outerLaneSpinOnly) {
          logStaticGateStage('part6-batch-dispatch');
          void runPart6FullSpinTelemetryBatch();
        } else {
          startPart3OuterLaneProbe();
        }
      }
    };

    const startPart3OuterLaneSpin = (index: number) => {
      const run = PART3_OUTER_SPIN_RUNS[index];
      if (!run || !ballBody || !ballMesh) return;
      const launchAzimuth = 0.37;
      const launchSurface = measureVisibleSurfaceAt(
        Math.sin(launchAzimuth) * PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS,
        Math.cos(launchAzimuth) * PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS,
        true,
        PART2_ACTUAL_DARK_TRACK_RADIUS_BAND,
      );
      if (!launchSurface) {
        throw new Error(
          'PART 2 could not measure the visible dark side-track surface at the launch radius',
        );
      }
      const launchNormal = new THREE.Vector3(
        launchSurface.normal.x,
        launchSurface.normal.y,
        launchSurface.normal.z,
      ).normalize();
      const launchPositionVector = new THREE.Vector3(
        launchSurface.point.x,
        launchSurface.point.y,
        launchSurface.point.z,
      ).addScaledVector(launchNormal, BALL_RADIUS + 0.002);
      const radialTangent = new THREE.Vector3(
        Math.cos(launchAzimuth),
        0,
        -Math.sin(launchAzimuth),
      );
      const initialVelocityVector = radialTangent
        .projectOnPlane(launchNormal)
        .normalize()
        .multiplyScalar(run.speed);
      const initialVelocity = {
        x: initialVelocityVector.x,
        y: initialVelocityVector.y,
        z: initialVelocityVector.z,
      };
      const initialAngularSpinVector = launchNormal
        .clone()
        .cross(initialVelocityVector)
        .multiplyScalar(1 / BALL_RADIUS);
      const initialAngularSpin = {
        x: initialAngularSpinVector.x,
        y: initialAngularSpinVector.y,
        z: initialAngularSpinVector.z,
      };
      const launchRadius = Math.hypot(
        launchPositionVector.x,
        launchPositionVector.z,
      );
      part3OuterLaneSpinIndex = index;
      part3OuterLaneSpinRunning = true;
      part3OuterLaneSpinElapsed = 0;
      part3OuterLaneSpinTrackAngle = null;
      part3OuterLaneSpinTrackAngleStart = null;
      part3OuterLaneSpinTrackAngleEnd = null;
      part3OuterLaneSpinCompletedLaps = 0;
      part3OuterLaneSpinLapSpeeds = [];
      part3OuterLaneSpinTrackFrames = 0;
      part3OuterLaneSpinContactFrames = 0;
      part3OuterLaneSpinSpeedSum = 0;
      part3OuterLaneSpinStartSpeed = 0;
      part3OuterLaneSpinEndSpeed = 0;
      part3OuterLaneSpinPeakSpeed = 0;
      part3OuterLaneSpinMinRadius = launchRadius;
      part3OuterLaneSpinMaxRadius = launchRadius;
      part3OuterLaneSpinMinRimClearance =
        PART2_ACTUAL_WOOD_INNER_RADIUS -
        BALL_RADIUS -
        launchRadius;
      part3OuterLaneSpinMinDeflectorClearance =
        launchRadius -
        BALL_RADIUS -
        (part4MeasuredDeflectorOuterRadius ??
          PART2_ACTUAL_INWARD_EDGE_RADIUS);
      part3OuterLaneSpinMaxPenetration = 0;
      part3OuterLaneSpinMaxSeparation = 0;
      part3OuterLaneSpinWoodContact = false;
      part3OuterLaneSpinHover = false;
      part3OuterLaneSpinClipping = false;
      part3OuterLaneSpinTunneling = false;
      part3OuterLaneSpinEscaped = false;
      part3OuterLaneSpinVelocitySpike = false;
      part3OuterLaneSpinArtificialAcceleration = false;
      part3OuterLaneSpinMaxVisualBodySyncError = 0;
      part3OuterLaneSpinMaxRotorSyncError = 0;
      part3OuterLaneSpinPreviousSpeed = run.speed;
      part3OuterLaneSpinRollingMismatchSum = 0;
      part3OuterLaneSpinRollingSamples = 0;
      part3OuterLaneSpinInwardTransitionTime = null;
      part3OuterLaneSpinInwardTransitionRadius = null;
      ballBody.setTranslation(
        {
          x: launchPositionVector.x,
          y: launchPositionVector.y,
          z: launchPositionVector.z,
        },
        true,
      );
      ballBody.setLinvel(initialVelocity, true);
      ballBody.setAngvel(initialAngularSpin, true);
      ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ballMesh.position.copy(launchPositionVector);
      ballMesh.quaternion.identity();
      publishPart3OuterLaneSpinReport({
        status: 'running',
        trackFriction: PART3_OUTER_SPIN_TRACK_FRICTION,
        linearDamping: PART3_OUTER_SPIN_LINEAR_DAMPING,
        angularDamping: PART3_OUTER_SPIN_ANGULAR_DAMPING,
        fixedTimestep: FIXED_TIMESTEP,
         operationalLaunchRadius: launchRadius,
         launchHeight: launchPositionVector.y,
        ballRadius: BALL_RADIUS,
        results: part3OuterLaneSpinResults,
        detail: `PART C running spin ${index + 1}/${PART3_OUTER_SPIN_RUNS.length}: ${run.label}.`,
      });
    };

    const runPart6FullSpinTelemetryBatch = async () => {
      if (part6TelemetryBatchRunning) return;

      const activeWorld = world;
      const activeBallBody = ballBody;
      const activeBallMesh = ballMesh;
      const activeBallCollider = physicsBallCollider;
      const activeRotorBody = rotorBody;
      const activeTrackCollider = part3TrackCollider;
      const activeRotorPivot = rotorPivot;

      const part6Params = new URLSearchParams(window.location.search);
      const requestedSeedCount = Number(
        part6Params.get('part6SeedCount') ?? PART6_FULL_SPIN_RUNS.length,
      );
      const activePart6SeedCount = Number.isFinite(requestedSeedCount)
        ? Math.max(
            1,
            Math.min(
              PART6_FULL_SPIN_RUNS.length,
              Math.floor(requestedSeedCount),
            ),
          )
        : PART6_FULL_SPIN_RUNS.length;
      const requestedSeedStartIndex = Number(
        part6Params.get('part6SeedStartIndex') ?? 0,
      );
      const activePart6SeedStartIndex = Number.isFinite(
        requestedSeedStartIndex,
      )
        ? Math.max(
            0,
            Math.min(
              PART6_FULL_SPIN_RUNS.length - 1,
              Math.floor(requestedSeedStartIndex),
            ),
          )
        : 0;
      const activePart6Runs = PART6_FULL_SPIN_RUNS.slice(
        activePart6SeedStartIndex,
        activePart6SeedStartIndex + activePart6SeedCount,
      );
      const requestedMaxDurationSeconds = Number(
        part6Params.get('part6MaxDurationSeconds') ??
          PART6_FULL_SPIN_MAX_DURATION_SECONDS,
      );
      const activePart6MaxDurationSeconds = Number.isFinite(
        requestedMaxDurationSeconds,
      )
        ? Math.max(
            FIXED_TIMESTEP * 2,
            Math.min(
              PART6_FULL_SPIN_MAX_DURATION_SECONDS,
              requestedMaxDurationSeconds,
            ),
          )
        : PART6_FULL_SPIN_MAX_DURATION_SECONDS;
      const part6DiagnosticMode =
        activePart6Runs.length !== PART6_FULL_SPIN_RUNS.length ||
        activePart6MaxDurationSeconds !==
          PART6_FULL_SPIN_MAX_DURATION_SECONDS;

      const summarize = (
        results: Part6FullSpinTelemetryResult[],
        status: Part6FullSpinTelemetryReport['status'],
        detail: string,
      ): Part6FullSpinTelemetryReport => {
        const lapCounts = results
          .map((result) => result.lapCount)
          .filter(Number.isFinite)
          .sort((left, right) => left - right);
        const contactRatios = results
          .map((result) => result.trackContactRatio)
          .filter(Number.isFinite)
          .sort((left, right) => left - right);
        const median = (values: number[]) => {
          if (values.length === 0) return null;
          const middle = Math.floor(values.length / 2);
          return values.length % 2 === 0
            ? (values[middle - 1] + values[middle]) / 2
            : values[middle];
        };
        const count = results.length;
        const safeRate = (value: number) =>
          count > 0 ? Number((value / count).toFixed(4)) : 0;
        const timedOutCount = results.filter((result) => result.timedOut).length;
        const phaseSequenceFailureCount = results.filter(
          (result) => !result.phaseSequenceValid,
        ).length;
        const fourToFiveLapCount = results.filter(
          (result) => result.outerLapTargetMet,
        ).length;
        const inwardTransitionCount = results.filter(
          (result) => result.inwardTransitionTime !== null,
        ).length;
        const deflectorContactCount = results.filter(
          (result) => result.deflectorContactCount > 0,
        ).length;
        const fretContactCount = results.filter(
          (result) => result.fretContact,
        ).length;
        const pocketEntryCount = results.filter(
          (result) => result.pocketEntered,
        ).length;
        const settledCount = results.filter((result) => result.settled).length;
        const safetyFailureCount = results.filter(
          (result) => !result.safetyPassed,
        ).length;
        const medianLapCount = median(lapCounts);
        const calibrationPassed =
          status === 'captured' &&
          activePart6Runs.length >= 5 &&
          results.length === activePart6Runs.length &&
          lapCounts.length === count &&
          count > 0 &&
          safetyFailureCount === 0 &&
          phaseSequenceFailureCount === 0 &&
          inwardTransitionCount === count &&
          pocketEntryCount === count &&
          settledCount === count &&
          medianLapCount !== null &&
          medianLapCount >= 4 &&
          medianLapCount <= 5 &&
          lapCounts[0] >= 3.5 &&
          lapCounts[lapCounts.length - 1] <= 5.5;

        return {
          status,
          safetyStatus:
            status === 'running'
              ? 'pending'
              : status === 'captured' &&
                  results.length === activePart6Runs.length &&
                  safetyFailureCount === 0
                ? 'passed'
                : 'failed',
          calibrationStatus:
            status === 'running'
              ? 'not-evaluated'
              : calibrationPassed
                ? 'passed'
                : 'failed',
          schemaVersion: PART6_TELEMETRY_SCHEMA_VERSION,
          fixedTimestep: FIXED_TIMESTEP,
          maxDurationSeconds: activePart6MaxDurationSeconds,
          seedCount: activePart6Runs.length,
          completedCount: results.filter(
            (result) => result.telemetryComplete,
          ).length,
          timedOutCount,
          phaseSequenceFailureCount,
          fourToFiveLapCount,
          inwardTransitionCount,
          deflectorContactCount,
          fretContactCount,
          pocketEntryCount,
          settledCount,
          safetyFailureCount,
          medianLapCount,
          minLapCount: lapCounts.length > 0 ? lapCounts[0] : null,
          maxLapCount:
            lapCounts.length > 0 ? lapCounts[lapCounts.length - 1] : null,
          medianTrackContactRatio: median(contactRatios),
          inwardTransitionRate: safeRate(inwardTransitionCount),
          deflectorContactRate: safeRate(deflectorContactCount),
          pocketEntryRate: safeRate(pocketEntryCount),
          settleRate: safeRate(settledCount),
          safetyFailureRate: safeRate(safetyFailureCount),
          trackFriction: PART3_OUTER_SPIN_TRACK_FRICTION,
          linearDamping: PART3_OUTER_SPIN_LINEAR_DAMPING,
          angularDamping: PART3_OUTER_SPIN_ANGULAR_DAMPING,
          results,
          detail,
        };
      };

      const failInfrastructure = (
        detail: string,
        errorKind: ValidationErrorKind,
        results: Part6FullSpinTelemetryResult[] = [],
      ) => {
        const report = summarize(results, 'failed', detail);
        publishPart6TelemetryReport(report);
        callbacksRef.current.onStateChange(
          'error',
          report.detail,
          errorKind,
        );
      };

      if (
        !activeWorld ||
        !activeBallBody ||
        !activeBallMesh ||
        !activeBallCollider ||
        !activeRotorBody ||
        !activeTrackCollider
      ) {
        failInfrastructure(
          'PART 6 telemetry could not start because the authoritative Rapier chain is incomplete.',
          'telemetry',
        );
        return;
      }
      if (!part4DeflectorAudit?.passed) {
        failInfrastructure(
          'PART 6 telemetry refused to run without the asset-measured visible-deflector audit.',
          'geometry-audit',
        );
        return;
      }

      const results: Part6FullSpinTelemetryResult[] = [];
      const maxSteps = Math.round(
        activePart6MaxDurationSeconds / FIXED_TIMESTEP,
      );
      const part6HeadlessFastMode =
        part6Params.get('part6Headless') === '1';
      const telemetryYieldSteps = part6DiagnosticMode
        ? PART6_DIAGNOSTIC_YIELD_STEPS
        : part6HeadlessFastMode
          ? PART6_UI_YIELD_STEPS * 2
          : PART6_INTERACTIVE_YIELD_STEPS;

      const previewSnapshot = {
        ballTranslation: { ...activeBallBody.translation() },
        ballRotation: { ...activeBallBody.rotation() },
        ballLinvel: { ...activeBallBody.linvel() },
        ballAngvel: { ...activeBallBody.angvel() },
        ballMeshPosition: activeBallMesh.position.clone(),
        ballMeshQuaternion: activeBallMesh.quaternion.clone(),
        ballMeshVisible: activeBallMesh.visible,
        rotorRotation: { ...activeRotorBody.rotation() },
        rotorAngle: rotorAngleRef.current,
        rotorPivotAngle:
          activeRotorPivot?.rotation.y ?? rotorAngleRef.current,
      };

      // The 20-seed batch is an accelerated validation workload, not the
      // real-time presentation spin. Hide the visible ball while the batch
      // owns the authoritative body so browser yields cannot render seed jumps.
      if (!part6HeadlessFastMode) {
        activeBallMesh.visible = false;
      }
      const settleFramesRequired = Math.round(
        PART6_SETTLE_DURATION_SECONDS / FIXED_TIMESTEP,
      );
      const pocketResultCenterRadiusMin =
        POCKET_FLOOR_INNER_RADIUS + BALL_RADIUS;
      const pocketResultCenterRadiusMax =
        POCKET_OUTER_LIP_RADIUS - BALL_RADIUS;
      const hoverGraceFrames = Math.round(
        PART6_TRANSITION_HOVER_GRACE_SECONDS / FIXED_TIMESTEP,
      );
      const phaseOrder: Part6SpinPhase[] = [
        'OUTER_RACE',
        'INWARD_DESCENT',
        'DEFLECTOR_ZONE',
        'ROTOR_ENTRY',
        'FRETS',
        'POCKET',
        'SETTLED',
      ];

      const interpolateProfileY = (
        profile: readonly [number, number][],
        radius: number,
      ) => {
        if (profile.length === 0) return null;
        if (radius <= profile[0][0]) return profile[0][1];
        if (radius >= profile[profile.length - 1][0]) {
          return profile[profile.length - 1][1];
        }
        for (let index = 1; index < profile.length; index += 1) {
          const [rightRadius, rightY] = profile[index];
          const [leftRadius, leftY] = profile[index - 1];
          if (radius <= rightRadius) {
            const alpha =
              (radius - leftRadius) / (rightRadius - leftRadius);
            return THREE.MathUtils.lerp(leftY, rightY, alpha);
          }
        }
        return null;
      };

      const transitionSurfaceY = (radius: number) => {
        if (radius >= part3BowlBridgeOuterRadius) {
          return part2ChannelSurfaceAt(
            radius,
            part2RaceVerticalOffset,
          ).y;
        }
        if (radius >= BOWL_BRIDGE_INNER_RADIUS) {
          return interpolateProfileY(part3BowlBridgeProfile, radius);
        }
        if (
          radius >= POCKET_FLOOR_OUTER_RADIUS &&
          radius <= POCKET_OUTER_LIP_RADIUS
        ) {
          const alpha =
            (radius - POCKET_FLOOR_OUTER_RADIUS) /
            (POCKET_OUTER_LIP_RADIUS - POCKET_FLOOR_OUTER_RADIUS);
          const activePocketOuterLipY =
            part6FullSpinRouteActive &&
            part3BowlBridgeProfile.length > 0
              ? part3BowlBridgeProfile[0][1]
              : POCKET_OUTER_LIP_Y;
          return THREE.MathUtils.lerp(
            POCKET_FLOOR_Y,
            activePocketOuterLipY,
            alpha,
          );
        }
        if (radius >= POCKET_FLOOR_INNER_RADIUS) {
          return POCKET_FLOOR_Y;
        }
        return null;
      };

      const yieldToBrowser = () =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0);
        });
      const logPart6DiagnosticStage = (
        stage: string,
        extra: Record<string, number | string | boolean | null> = {},
      ) => {
        if (!part6DiagnosticMode) return;
        console.info(
          'PART6_DIAGNOSTIC_STAGE',
          JSON.stringify({ stage, ...extra }),
        );
      };

      logPart6DiagnosticStage('batch-ready', {
        seedCount: activePart6Runs.length,
        maxSteps,
        maxDurationSeconds: activePart6MaxDurationSeconds,
      });
      part6TelemetryBatchRunning = true;
      publishPart6TelemetryReport(
        summarize(
          results,
          'running',
          part6DiagnosticMode
            ? 'PART 6B.1 diagnostic telemetry is running on a bounded seed/time slice; physics coefficients are unchanged.'
            : 'PART 6A.1 deterministic full-spin telemetry is running with isolated seed resets and phase tracking; physics coefficients are unchanged.',
        ),
      );
      // Commit the running report before heavy deterministic stepping starts.
      // Headless mode remains faster, but never monopolizes the browser task
      // for an entire 30-second simulated seed.
      await yieldToBrowser();
      if (disposed) return;
      logPart6DiagnosticStage('initial-yield-complete');

      try {
        for (const run of activePart6Runs) {
          if (disposed) return;
          logPart6DiagnosticStage('seed-start', { seed: run.seed });
          logPart6DiagnosticStage('launch-surface-before', { seed: run.seed });

          const launchSurface = measureVisibleSurfaceAt(
            Math.sin(run.launchAzimuth) *
              PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS,
            Math.cos(run.launchAzimuth) *
              PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS,
            true,
            PART2_ACTUAL_DARK_TRACK_RADIUS_BAND,
          );
          logPart6DiagnosticStage('launch-surface-after', {
            seed: run.seed,
            found: Boolean(launchSurface),
          });
          if (!launchSurface) {
            failInfrastructure(
              'PART 6 geometry audit stopped the batch because seed ' +
                String(run.seed) +
                ' has no measurable visible dark-race launch surface.',
              'geometry-audit',
              results,
            );
            return;
          }

          const launchClearance = BALL_RADIUS + 0.01;
          const operationalLaunchCenterRadius =
            PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS;
          let launchContactRadius = operationalLaunchCenterRadius;
          let launchNormal = part2ChannelNormalAt(
            launchContactRadius,
            run.launchAzimuth,
          );
          for (let iteration = 0; iteration < 3; iteration += 1) {
            const radialNormal =
              launchNormal.x * Math.sin(run.launchAzimuth) +
              launchNormal.z * Math.cos(run.launchAzimuth);
            launchContactRadius =
              operationalLaunchCenterRadius -
              radialNormal * launchClearance;
            launchNormal = part2ChannelNormalAt(
              launchContactRadius,
              run.launchAzimuth,
            );
          }
          const launchChannelSurface = part2ChannelSurfaceAt(
            launchContactRadius,
            part2RaceVerticalOffset,
          );
          const launchPosition = new THREE.Vector3(
            Math.sin(run.launchAzimuth) * launchContactRadius,
            launchChannelSurface.y,
            Math.cos(run.launchAzimuth) * launchContactRadius,
          ).addScaledVector(launchNormal, launchClearance);
          const tangent = new THREE.Vector3(
            Math.cos(run.launchAzimuth),
            0,
            -Math.sin(run.launchAzimuth),
          )
            .projectOnPlane(launchNormal)
            .normalize();
          const launchVelocity = tangent.clone().multiplyScalar(run.speed);
          const launchAngularVelocity = launchNormal
            .clone()
            .cross(launchVelocity)
            .multiplyScalar(PART6_BALL_SPIN_FACTOR / BALL_RADIUS);

          // Flush the previous seed's dynamic state and contact manifold before
          // applying this seed's launch. No impulse/force is used.
          activeBallBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
          activeBallBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
          activeBallBody.setTranslation(
            {
              x: launchPosition.x,
              y: launchPosition.y,
              z: launchPosition.z,
            },
            true,
          );
          activeBallBody.setRotation(
            { x: 0, y: 0, z: 0, w: 1 },
            true,
          );
          let rotorAngle = normalizedAngle(run.rotorStartAngle);
          rotorAngleRef.current = rotorAngle;
          activeRotorBody.setRotation(
            {
              x: 0,
              y: Math.sin(rotorAngle / 2),
              z: 0,
              w: Math.cos(rotorAngle / 2),
            },
            true,
          );
          activeRotorBody.setNextKinematicRotation({
            x: 0,
            y: Math.sin(rotorAngle / 2),
            z: 0,
            w: Math.cos(rotorAngle / 2),
          });
          activeRotorPivot?.rotation.set(0, rotorAngle, 0);
          logPart6DiagnosticStage('reset-world-step-before', {
            seed: run.seed,
          });
          activeWorld.step();
          logPart6DiagnosticStage('reset-world-step-after', {
            seed: run.seed,
          });

          activeBallBody.setTranslation(
            {
              x: launchPosition.x,
              y: launchPosition.y,
              z: launchPosition.z,
            },
            true,
          );
          activeBallBody.setRotation(
            { x: 0, y: 0, z: 0, w: 1 },
            true,
          );
          activeBallBody.setLinvel(
            {
              x: launchVelocity.x,
              y: launchVelocity.y,
              z: launchVelocity.z,
            },
            true,
          );
          activeBallBody.setAngvel(
            {
              x: launchAngularVelocity.x,
              y: launchAngularVelocity.y,
              z: launchAngularVelocity.z,
            },
            true,
          );
          activeBallBody.wakeUp();

          const resetPosition = activeBallBody.translation();
          const resetVelocity = activeBallBody.linvel();
          const resetAngularVelocity = activeBallBody.angvel();
          const resetRotation = activeBallBody.rotation();
          const resetRotorRotation = activeRotorBody.rotation();
          const resetRotorAngle = normalizedAngle(
            2 *
              Math.atan2(
                resetRotorRotation.y,
                resetRotorRotation.w,
              ),
          );
          const resetRotorAngleError = Math.abs(
            THREE.MathUtils.euclideanModulo(
              resetRotorAngle - rotorAngle + Math.PI,
              TWO_PI,
            ) - Math.PI,
          );
          const resetPositionError = Math.hypot(
            resetPosition.x - launchPosition.x,
            resetPosition.y - launchPosition.y,
            resetPosition.z - launchPosition.z,
          );
          const resetVelocityError = Math.hypot(
            resetVelocity.x - launchVelocity.x,
            resetVelocity.y - launchVelocity.y,
            resetVelocity.z - launchVelocity.z,
          );
          const resetAngularVelocityError = Math.hypot(
            resetAngularVelocity.x - launchAngularVelocity.x,
            resetAngularVelocity.y - launchAngularVelocity.y,
            resetAngularVelocity.z - launchAngularVelocity.z,
          );
          const resetRotationError = Math.hypot(
            resetRotation.x,
            resetRotation.y,
            resetRotation.z,
            resetRotation.w - 1,
          );
          const stateResetVerified =
            resetPositionError <= PART6_STATE_RESET_VECTOR_EPSILON &&
            resetVelocityError <= PART6_STATE_RESET_VECTOR_EPSILON &&
            resetAngularVelocityError <= PART6_STATE_RESET_VECTOR_EPSILON &&
            resetRotationError <= PART6_STATE_RESET_VECTOR_EPSILON &&
            resetRotorAngleError <= PART6_STATE_RESET_ANGLE_EPSILON;
          logPart6DiagnosticStage('reset-verified', {
            seed: run.seed,
            stateResetVerified,
          });

          let elapsed = 0;
          let minRadius = Math.hypot(
            launchPosition.x,
            launchPosition.z,
          );
          let maxRadius = minRadius;
          let trackAngle: number | null = null;
          let trackAngleStart: number | null = null;
          let trackAngleEnd: number | null = null;
          let completedLaps = 0;
          const lapSpeeds: number[] = [];
          let trackFrames = 0;
          let trackContactFrames = 0;
          let trackStartSpeed = 0;
          let trackEndSpeed = run.speed;
          let peakSpeed = run.speed;
          let maxTrackPenetration = 0;
          let maxTrackSeparation = 0;
          let maxPocketFloorPenetration = 0;
          let maxPocketFloorSeparation = 0;
          let inwardTransitionTime: number | null = null;
          let inwardTransitionRadius: number | null = null;
          const phases: Part6PhaseEvent[] = [];
          const recordedPhases = new Set<Part6SpinPhase>();
          let transitionMinRadius = Number.POSITIVE_INFINITY;
          let transitionMaxRadius = Number.NEGATIVE_INFINITY;
          let transitionMinY = Number.POSITIVE_INFINITY;
          let transitionMaxY = Number.NEGATIVE_INFINITY;
          let transitionMaxSurfacePenetration = 0;
          let transitionMaxSurfaceSeparation = 0;
          const transitionContactRoles = new Set<string>();
          let unsupportedTransitionFrames = 0;
          let maxUnsupportedTransitionFrames = 0;
          let rotorEntryTime: number | null = null;
          let deflectorContactCount = 0;
          let deflectorContactActive = false;
          let firstDeflectorContactTime: number | null = null;
          let impactSpeedBefore: number | null = null;
          let impactSpeedAfter: number | null = null;
          let impactDirectionBefore: THREE.Vector3 | null = null;
          let impactDirectionAfter: THREE.Vector3 | null = null;
          let fretContact = false;
          let firstFretContactTime: number | null = null;
          let firstFretContactStep: number | null = null;
          let pocketEntered = false;
          let pocketEntryTime: number | null = null;
          let settledFrames = 0;
          let settled = false;
          let settleTime: number | null = null;
          let hover = false;
          let clipping = false;
          let tunneling = false;
          let escaped = false;
          let velocitySpike = false;
          let artificialAcceleration = false;
          let maxVisualBodySyncError = 0;
          let maxRotorSyncError = 0;
          let previousSpeed = run.speed;
          const previousTracePosition = launchPosition.clone();
          const previousTraceVelocity = launchVelocity.clone();
          let firstSpikeTraceLogged = false;
          let previousPlanarDirection = tangent.clone();
          let finalSpeed = run.speed;
          let finalRotorRelativeSpeed = run.speed;
          let finalPocketIndex: number | null = null;
          let finalPocketNumber: number | null = null;

          const recordPhase = (
            phase: Part6SpinPhase,
            position: { x: number; y: number; z: number },
            speed: number,
            contactRole: string | null = null,
          ) => {
            if (recordedPhases.has(phase)) return;
            recordedPhases.add(phase);
            phases.push({
              phase,
              time: Number(elapsed.toFixed(4)),
              radius: Number(
                Math.hypot(position.x, position.z).toFixed(4),
              ),
              y: Number(position.y.toFixed(4)),
              speed: Number(speed.toFixed(4)),
              contactRole,
            });
          };

          const preFretTraceSeed =
            run.seed === 61004 || run.seed === 61005 || run.seed === 61006;
          const preFretCheckpoints = new Set<string>();
          const logPreFretCheckpoint = (
            checkpoint:
              | 'INWARD_DESCENT'
              | 'DEFLECTOR_CONTACT'
              | 'ROTOR_ENTRY'
              | 'POCKET_ENTRY'
              | 'PHYSICAL_FRET_CONTACT',
            step: number,
            position: { x: number; y: number; z: number },
            velocity: { x: number; y: number; z: number },
            speed: number,
            radius: number,
            contactRoles: Set<string>,
          ) => {
            if (!preFretTraceSeed || preFretCheckpoints.has(checkpoint)) return;
            preFretCheckpoints.add(checkpoint);
            const radialVelocity =
              radius > 0
                ? (position.x * velocity.x + position.z * velocity.z) / radius
                : 0;
            const rotorTangentialVelocity = {
              x: TEST_ANGULAR_SPEED * position.z,
              y: 0,
              z: -TEST_ANGULAR_SPEED * position.x,
            };
            const rotorRelativeSpeed = Math.hypot(
              velocity.x - rotorTangentialVelocity.x,
              velocity.y - rotorTangentialVelocity.y,
              velocity.z - rotorTangentialVelocity.z,
            );
            const rotorRotation = activeRotorBody.rotation();
            const bodyRotorAngle = normalizedAngle(
              2 * Math.atan2(rotorRotation.y, rotorRotation.w),
            );
            const localAngle = normalizedAngle(
              Math.atan2(position.x, position.z) - bodyRotorAngle,
            );
            const pocketIndex =
              radius > 1.18 && radius < 1.98
                ? pocketIndexFromLocalPosition(
                    Math.sin(localAngle),
                    Math.cos(localAngle),
                  )
                : null;
            console.info(
              'ROULETTE_PRE_FRET_CHECKPOINT',
              JSON.stringify({
                source: 'browser',
                seed: String(run.seed),
                checkpoint,
                simulationTimeSeconds: Number(elapsed.toFixed(6)),
                step,
                rotorAngle: Number(bodyRotorAngle.toFixed(9)),
                position: {
                  x: Number(position.x.toFixed(6)),
                  y: Number(position.y.toFixed(6)),
                  z: Number(position.z.toFixed(6)),
                },
                velocity: {
                  x: Number(velocity.x.toFixed(6)),
                  y: Number(velocity.y.toFixed(6)),
                  z: Number(velocity.z.toFixed(6)),
                },
                speed: Number(speed.toFixed(6)),
                radius: Number(radius.toFixed(6)),
                radialVelocity: Number(radialVelocity.toFixed(6)),
                verticalVelocity: Number(velocity.y.toFixed(6)),
                rotorRelativeSpeed: Number(rotorRelativeSpeed.toFixed(6)),
                contactRoles: [...contactRoles].sort(),
                deflectorContact: contactRoles.has(
                  'asset-measured-visible-deflector-cuboid',
                ),
                bowlBridgeContact: contactRoles.has(
                  'stationary-bowl-apron-bridge',
                ),
                outerLipContact: contactRoles.has('pocket-outer-lip-trimesh'),
                pocketFloorContact:
                  contactRoles.has('pocket-floor-trimesh') ||
                  contactRoles.has('pocket-floor-catch-underlay'),
                fretContact: contactRoles.has('pocket-fret-cuboid'),
                pocketIndex,
              }),
            );
          };

          const preInwardCheckpoints = new Set<string>();
          const logPreInwardCheckpoint = (
            checkpoint: string,
            step: number,
            position: { x: number; y: number; z: number },
            velocity: { x: number; y: number; z: number },
            speed: number,
            radius: number,
            contactRoles: Set<string>,
            trackContact: boolean,
          ) => {
            if (!preFretTraceSeed || preInwardCheckpoints.has(checkpoint)) return;
            preInwardCheckpoints.add(checkpoint);
            const radialVelocity =
              radius > 0
                ? (position.x * velocity.x + position.z * velocity.z) / radius
                : 0;
            const rotorRotation = activeRotorBody.rotation();
            const bodyRotorAngle = normalizedAngle(
              2 * Math.atan2(rotorRotation.y, rotorRotation.w),
            );
            const ballAngularVelocity = activeBallBody.angvel();
            console.info(
              'ROULETTE_PRE_INWARD_CHECKPOINT',
              JSON.stringify({
                source: 'browser',
                seed: String(run.seed),
                checkpoint,
                simulationTimeSeconds: Number(elapsed.toFixed(6)),
                step,
                rotorAngle: Number(bodyRotorAngle.toFixed(9)),
                worldAzimuth: Number(
                  normalizedAngle(Math.atan2(position.x, position.z)).toFixed(9),
                ),
                position: {
                  x: Number(position.x.toFixed(6)),
                  y: Number(position.y.toFixed(6)),
                  z: Number(position.z.toFixed(6)),
                },
                velocity: {
                  x: Number(velocity.x.toFixed(6)),
                  y: Number(velocity.y.toFixed(6)),
                  z: Number(velocity.z.toFixed(6)),
                },
                speed: Number(speed.toFixed(6)),
                radius: Number(radius.toFixed(6)),
                radialVelocity: Number(radialVelocity.toFixed(6)),
                verticalVelocity: Number(velocity.y.toFixed(6)),
                angularVelocity: {
                  x: Number(ballAngularVelocity.x.toFixed(6)),
                  y: Number(ballAngularVelocity.y.toFixed(6)),
                  z: Number(ballAngularVelocity.z.toFixed(6)),
                },
                angularSpeed: Number(
                  Math.hypot(
                    ballAngularVelocity.x,
                    ballAngularVelocity.y,
                    ballAngularVelocity.z,
                  ).toFixed(6),
                ),
                contactRoles: [...contactRoles].sort(),
                trackContact,
              }),
            );
          };

          recordPhase(
            'OUTER_RACE',
            {
              x: launchPosition.x,
              y: launchPosition.y,
              z: launchPosition.z,
            },
            run.speed,
          );

          for (let step = 0; step < maxSteps; step += 1) {
            if (disposed) return;
            if (step === 0) {
              logPart6DiagnosticStage('simulation-step-0-before', {
                seed: run.seed,
              });
            }

            rotorAngle = normalizedAngle(
              rotorAngle + TEST_ANGULAR_SPEED * FIXED_TIMESTEP,
            );
            rotorAngleRef.current = rotorAngle;
            activeRotorBody.setNextKinematicRotation({
              x: 0,
              y: Math.sin(rotorAngle / 2),
              z: 0,
              w: Math.cos(rotorAngle / 2),
            });
            activeRotorPivot?.rotation.set(0, rotorAngle, 0);
            activeWorld.step();
            if (step === 0) {
              logPart6DiagnosticStage('simulation-step-0-after', {
                seed: run.seed,
              });
            }
            elapsed += FIXED_TIMESTEP;

            const position = activeBallBody.translation();
            const velocity = activeBallBody.linvel();
            const speed = Math.hypot(
              velocity.x,
              velocity.y,
              velocity.z,
            );
            const radius = Math.hypot(position.x, position.z);
            const bottom = position.y - BALL_RADIUS;
            minRadius = Math.min(minRadius, radius);
            maxRadius = Math.max(maxRadius, radius);
            finalSpeed = speed;
            peakSpeed = Math.max(peakSpeed, speed);

            if (
              part6DiagnosticMode &&
              step > 0 &&
              step % PART6_DIAGNOSTIC_PROGRESS_STEPS === 0
            ) {
              console.info(
                'PART6_STEP_PROGRESS',
                JSON.stringify({
                  seed: run.seed,
                  step,
                  maxSteps,
                  elapsed: Number(elapsed.toFixed(4)),
                  radius: Number(radius.toFixed(4)),
                  speed: Number(speed.toFixed(4)),
                }),
              );
            }

            let trackPairContact = false;
            let deflectorPairContact = false;
            let fretPairContact = false;
            let pocketFloorContact = false;
            const stepContactRoles = new Set<string>();
            activeWorld.contactPairsWith(
              activeBallCollider,
              (otherCollider) => {
                let geometricContact = false;
                activeWorld.contactPair(
                  activeBallCollider,
                  otherCollider,
                  (manifold) => {
                    if (manifold.numContacts() > 0) {
                      geometricContact = true;
                    }
                  },
                );
                if (!geometricContact) return;

                if (
                  otherCollider.handle === activeTrackCollider.handle
                ) {
                  trackPairContact = true;
                }
                const role = part3ColliderRoles.get(
                  otherCollider.handle,
                );
                if (role) stepContactRoles.add(role);
                if (
                  role === 'asset-measured-visible-deflector-cuboid'
                ) {
                  deflectorPairContact = true;
                }
                if (role === 'pocket-fret-cuboid') {
                  fretPairContact = true;
                }
                if (
                  role === 'pocket-floor-trimesh' ||
                  role === 'pocket-floor-catch-underlay'
                ) {
                  pocketFloorContact = true;
                }
              },
            );

            if (step === 0) {
              logPreInwardCheckpoint(
                'LAUNCH_STEP_0',
                step,
                position,
                velocity,
                speed,
                radius,
                stepContactRoles,
                trackPairContact,
              );
            }

            const inTrackCenterBand =
              radius >= PART2_ACTUAL_TRACK_CENTER_RADIUS_BAND[0] &&
              radius <= PART2_ACTUAL_TRACK_CENTER_RADIUS_BAND[1];
            if (inTrackCenterBand) {
              trackFrames += 1;
              if (trackPairContact) trackContactFrames += 1;

              const activeTrackRole =
                part3ColliderRoles.get(activeTrackCollider.handle) ?? null;
              const actualGlbTrackActive =
                activeTrackRole === 'actual-glb-outside-trimesh';
              let signedRaceGap: number;

              if (actualGlbTrackActive) {
                const visibleRaceSurface = measureVisibleSurfaceAt(
                  position.x,
                  position.z,
                  true,
                  PART2_ACTUAL_DARK_TRACK_RADIUS_BAND,
                );
                if (visibleRaceSurface) {
                  const visiblePoint = new THREE.Vector3(
                    visibleRaceSurface.point.x,
                    visibleRaceSurface.point.y,
                    visibleRaceSurface.point.z,
                  );
                  const visibleNormal = new THREE.Vector3(
                    visibleRaceSurface.normal.x,
                    visibleRaceSurface.normal.y,
                    visibleRaceSurface.normal.z,
                  ).normalize();
                  signedRaceGap =
                    new THREE.Vector3(
                      position.x,
                      position.y,
                      position.z,
                    )
                      .sub(visiblePoint)
                      .dot(visibleNormal) -
                    BALL_RADIUS;
                } else {
                  signedRaceGap = 0;
                }
              } else {
                const raceSurfaceY = part2ChannelSurfaceAt(
                  radius,
                  part2RaceVerticalOffset,
                ).y;
                signedRaceGap = bottom - raceSurfaceY;
              }

              maxTrackPenetration = Math.max(
                maxTrackPenetration,
                Math.max(0, -signedRaceGap),
              );
              maxTrackSeparation = Math.max(
                maxTrackSeparation,
                Math.max(0, signedRaceGap),
              );
              clipping ||= signedRaceGap < -0.03;
              tunneling ||= signedRaceGap < -0.08;
            }

            const angle = normalizedAngle(
              Math.atan2(position.x, position.z),
            );
            if (
              inTrackCenterBand &&
              trackPairContact &&
              inwardTransitionTime === null
            ) {
              if (trackAngle === null) {
                trackAngle = angle;
                trackAngleStart = angle;
                trackStartSpeed = speed;
              } else {
                const delta =
                  THREE.MathUtils.euclideanModulo(
                    angle -
                      normalizedAngle(trackAngle) +
                      Math.PI,
                    TWO_PI,
                  ) - Math.PI;
                trackAngle += delta;
                trackAngleEnd = trackAngle;
                const lapCountNow = Math.floor(
                  Math.abs(trackAngle - trackAngleStart!) / TWO_PI,
                );
                if (lapCountNow > completedLaps) {
                  completedLaps = lapCountNow;
                  lapSpeeds.push(speed);
                  if (lapCountNow <= 4) {
                    logPreInwardCheckpoint(
                      `LAP_${lapCountNow}`,
                      step,
                      position,
                      velocity,
                      speed,
                      radius,
                      stepContactRoles,
                      trackPairContact,
                    );
                  }
                }
              }
              trackEndSpeed = speed;
            } else if (
              inwardTransitionTime === null &&
              trackAngleStart !== null &&
              radius < PART2_ACTUAL_TRACK_CENTER_RADIUS_BAND[0]
            ) {
              inwardTransitionTime = elapsed;
              inwardTransitionRadius = radius;
              trackAngleEnd ??= trackAngle;
              logPreInwardCheckpoint(
                'INWARD_DESCENT',
                step,
                position,
                velocity,
                speed,
                radius,
                stepContactRoles,
                trackPairContact,
              );
              logPreFretCheckpoint(
                'INWARD_DESCENT',
                step,
                position,
                velocity,
                speed,
                radius,
                stepContactRoles,
              );
              recordPhase(
                'INWARD_DESCENT',
                position,
                speed,
                [...stepContactRoles][0] ?? null,
              );
            }

            const deflectorZoneThreshold =
              (part4MeasuredDeflectorOuterRadius ??
                PART2_ACTUAL_INWARD_EDGE_RADIUS) +
              BALL_RADIUS +
              0.12;
            if (
              inwardTransitionTime !== null &&
              radius <= deflectorZoneThreshold
            ) {
              recordPhase(
                'DEFLECTOR_ZONE',
                position,
                speed,
                deflectorPairContact
                  ? 'asset-measured-visible-deflector-cuboid'
                  : [...stepContactRoles][0] ?? null,
              );
            }

            const rotorEntryThreshold =
              POCKET_OUTER_LIP_RADIUS + BALL_RADIUS + 0.08;
            if (
              inwardTransitionTime !== null &&
              radius <= rotorEntryThreshold
            ) {
              if (rotorEntryTime === null) {
                logPreFretCheckpoint(
                  'ROTOR_ENTRY',
                  step,
                  position,
                  velocity,
                  speed,
                  radius,
                  stepContactRoles,
                );
              }
              rotorEntryTime ??= elapsed;
              recordPhase(
                'ROTOR_ENTRY',
                position,
                speed,
                [...stepContactRoles][0] ?? null,
              );
            }

            if (
              inwardTransitionTime !== null &&
              deflectorPairContact &&
              !deflectorContactActive
            ) {
              deflectorContactCount += 1;
              logPreFretCheckpoint(
                'DEFLECTOR_CONTACT',
                step,
                position,
                velocity,
                speed,
                radius,
                stepContactRoles,
              );
              firstDeflectorContactTime ??= elapsed;
              impactSpeedBefore ??= previousSpeed;
              impactDirectionBefore ??=
                previousPlanarDirection.clone();
              recordPhase(
                'DEFLECTOR_ZONE',
                position,
                speed,
                'asset-measured-visible-deflector-cuboid',
              );
            }
            if (
              !deflectorPairContact &&
              deflectorContactActive &&
              impactSpeedAfter === null
            ) {
              impactSpeedAfter = speed;
              const postImpactDirection = new THREE.Vector3(
                velocity.x,
                0,
                velocity.z,
              );
              if (postImpactDirection.lengthSq() > 0.000001) {
                impactDirectionAfter =
                  postImpactDirection.normalize();
              }
            }
            deflectorContactActive = deflectorPairContact;

            if (fretPairContact) {
              fretContact = true;
              if (firstFretContactStep === null) {
                logPreFretCheckpoint(
                  'PHYSICAL_FRET_CONTACT',
                  step,
                  position,
                  velocity,
                  speed,
                  radius,
                  stepContactRoles,
                );
              }
              firstFretContactTime ??= elapsed;
              firstFretContactStep ??= step;
              recordPhase(
                'FRETS',
                position,
                speed,
                'pocket-fret-cuboid',
              );
            }

            const insidePocket =
              radius >= POCKET_FLOOR_INNER_RADIUS + BALL_RADIUS &&
              radius <= POCKET_OUTER_LIP_RADIUS - BALL_RADIUS &&
              bottom >= POCKET_FLOOR_Y - 0.08 &&
              bottom <= POCKET_FLOOR_Y + 0.16;
            const pocketContactInsideRotorEnvelope =
              pocketFloorContact &&
              radius <= POCKET_OUTER_LIP_RADIUS + BALL_RADIUS + 0.04;
            if (insidePocket || pocketContactInsideRotorEnvelope) {
              pocketEntered = true;
              if (pocketEntryTime === null) {
                logPreFretCheckpoint(
                  'POCKET_ENTRY',
                  step,
                  position,
                  velocity,
                  speed,
                  radius,
                  stepContactRoles,
                );
              }
              pocketEntryTime ??= elapsed;
              recordPhase(
                'POCKET',
                position,
                speed,
                pocketContactInsideRotorEnvelope
                  ? [...stepContactRoles].find(
                      (role) =>
                        role === 'pocket-floor-trimesh' ||
                        role === 'pocket-floor-catch-underlay',
                    ) ?? null
                  : null,
              );
            }

            if (
              inwardTransitionTime !== null &&
              !pocketEntered
            ) {
              transitionMinRadius = Math.min(
                transitionMinRadius,
                radius,
              );
              transitionMaxRadius = Math.max(
                transitionMaxRadius,
                radius,
              );
              transitionMinY = Math.min(transitionMinY, position.y);
              transitionMaxY = Math.max(transitionMaxY, position.y);
              for (const role of stepContactRoles) {
                transitionContactRoles.add(role);
              }
              const expectedSurfaceY = transitionSurfaceY(radius);
              if (expectedSurfaceY !== null) {
                const signedTransitionGap =
                  bottom - expectedSurfaceY;
                transitionMaxSurfacePenetration = Math.max(
                  transitionMaxSurfacePenetration,
                  Math.max(0, -signedTransitionGap),
                );
                transitionMaxSurfaceSeparation = Math.max(
                  transitionMaxSurfaceSeparation,
                  Math.max(0, signedTransitionGap),
                );
                clipping ||= signedTransitionGap < -0.04;
                tunneling ||= signedTransitionGap < -0.1;
                if (
                  signedTransitionGap > 0.08 &&
                  stepContactRoles.size === 0
                ) {
                  unsupportedTransitionFrames += 1;
                  maxUnsupportedTransitionFrames = Math.max(
                    maxUnsupportedTransitionFrames,
                    unsupportedTransitionFrames,
                  );
                } else {
                  unsupportedTransitionFrames = 0;
                }
              }
            }

            const rotorTangentialVelocity = {
              x: TEST_ANGULAR_SPEED * position.z,
              y: 0,
              z: -TEST_ANGULAR_SPEED * position.x,
            };
            finalRotorRelativeSpeed = Math.hypot(
              velocity.x - rotorTangentialVelocity.x,
              velocity.y - rotorTangentialVelocity.y,
              velocity.z - rotorTangentialVelocity.z,
            );
            if (
              ([61001, 61004, 61005, 61006, 61007, 61008].includes(run.seed)) &&
              elapsed >= activePart6MaxDurationSeconds - 2 &&
              step % 12 === 0
            ) {
              const localPocketAngle = normalizedAngle(
                Math.atan2(position.x, position.z) - rotorAngle,
              );
              const tracePocketIndex =
                radius >= pocketResultCenterRadiusMin &&
                radius <= pocketResultCenterRadiusMax
                  ? pocketIndexFromLocalPosition(
                      Math.sin(localPocketAngle),
                      Math.cos(localPocketAngle),
                    )
                  : null;
              console.info(
                'PART6_TIMEOUT_FINAL_CONTACT_TRACE',
                JSON.stringify({
                  seed: run.seed,
                  step,
                  elapsed: Number(elapsed.toFixed(6)),
                  radius: Number(radius.toFixed(6)),
                  bottom: Number(bottom.toFixed(6)),
                  speed: Number(speed.toFixed(6)),
                  rotorRelativeSpeed: Number(
                    finalRotorRelativeSpeed.toFixed(6),
                  ),
                  pocketIndex: tracePocketIndex,
                  pocketEntered,
                  settledFrames,
                  settleChecks: {
                    rotorRelative:
                      finalRotorRelativeSpeed < 0.12,
                    radius:
                      radius >= pocketResultCenterRadiusMin &&
                      radius <= pocketResultCenterRadiusMax,
                    floor:
                      Math.abs(bottom - POCKET_FLOOR_Y) <= 0.12,
                  },
                  contactRoles: [...stepContactRoles].sort(),
                }),
              );
            }
            if (
              pocketEntered &&
              finalRotorRelativeSpeed < 0.12 &&
              radius >= pocketResultCenterRadiusMin &&
              radius <= pocketResultCenterRadiusMax &&
              Math.abs(bottom - POCKET_FLOOR_Y) <= 0.12
            ) {
              settledFrames += 1;
            } else {
              settledFrames = 0;
            }
            if (settledFrames >= settleFramesRequired) {
              settled = true;
              settleTime = elapsed;
              recordPhase(
                'SETTLED',
                position,
                speed,
                [...stepContactRoles][0] ?? null,
              );
            }

            const floorPenetration =
              pocketEntered
                ? Math.max(0, POCKET_FLOOR_Y - bottom)
                : 0;
            const floorSeparation =
              pocketEntered
                ? Math.max(0, bottom - POCKET_FLOOR_Y)
                : 0;
            maxPocketFloorPenetration = Math.max(
              maxPocketFloorPenetration,
              floorPenetration,
            );
            maxPocketFloorSeparation = Math.max(
              maxPocketFloorSeparation,
              floorSeparation,
            );
            clipping ||= floorPenetration > 0.03;
            tunneling ||= floorPenetration > 0.08;
            escaped ||=
              !Number.isFinite(position.x) ||
              !Number.isFinite(position.y) ||
              !Number.isFinite(position.z) ||
              radius < 0.18 ||
              radius > 3.08 ||
              position.y <
                POCKET_FLOOR_Y - BALL_RADIUS - 0.18;
            const velocitySpikeThisStep =
              speed > Math.max(8, previousSpeed * 4);
            const artificialAccelerationThisStep =
              speed >
              Math.max(
                12,
                previousSpeed > 0
                  ? previousSpeed * 3
                  : 12,
              );
            if (
              (run.seed === 61008 || run.seed === 61022) &&
              !firstSpikeTraceLogged &&
              (velocitySpikeThisStep || artificialAccelerationThisStep)
            ) {
              firstSpikeTraceLogged = true;
              const ballAngularVelocity = activeBallBody.angvel();
              console.info(
                run.seed === 61008
                  ? 'PART6_SEED_61008_FIRST_SPIKE'
                  : 'PART6_SEED_61022_FIRST_SPIKE',
                JSON.stringify({
                  step,
                  elapsed: Number(elapsed.toFixed(6)),
                  previous: {
                    position: {
                      x: Number(previousTracePosition.x.toFixed(6)),
                      y: Number(previousTracePosition.y.toFixed(6)),
                      z: Number(previousTracePosition.z.toFixed(6)),
                    },
                    velocity: {
                      x: Number(previousTraceVelocity.x.toFixed(6)),
                      y: Number(previousTraceVelocity.y.toFixed(6)),
                      z: Number(previousTraceVelocity.z.toFixed(6)),
                    },
                    speed: Number(previousSpeed.toFixed(6)),
                  },
                  current: {
                    position: {
                      x: Number(position.x.toFixed(6)),
                      y: Number(position.y.toFixed(6)),
                      z: Number(position.z.toFixed(6)),
                    },
                    velocity: {
                      x: Number(velocity.x.toFixed(6)),
                      y: Number(velocity.y.toFixed(6)),
                      z: Number(velocity.z.toFixed(6)),
                    },
                    speed: Number(speed.toFixed(6)),
                    radius: Number(radius.toFixed(6)),
                    bottom: Number(bottom.toFixed(6)),
                    angularVelocity: {
                      x: Number(ballAngularVelocity.x.toFixed(6)),
                      y: Number(ballAngularVelocity.y.toFixed(6)),
                      z: Number(ballAngularVelocity.z.toFixed(6)),
                    },
                    rotorRelativeSpeed: Number(
                      finalRotorRelativeSpeed.toFixed(6),
                    ),
                  },
                  speedRatio:
                    previousSpeed > 0
                      ? Number((speed / previousSpeed).toFixed(6))
                      : null,
                  velocitySpikeThisStep,
                  artificialAccelerationThisStep,
                  contactRoles: [...stepContactRoles].sort(),
                  trackContact: trackPairContact,
                  deflectorContact: deflectorPairContact,
                  fretContact: fretPairContact,
                  pocketFloorContact,
                  pocketEntered,
                }),
              );
            }
            velocitySpike ||= velocitySpikeThisStep;
            artificialAcceleration ||= artificialAccelerationThisStep;

            const rotorRotation = activeRotorBody.rotation();
            const bodyRotorAngle = normalizedAngle(
              2 *
                Math.atan2(
                  rotorRotation.y,
                  rotorRotation.w,
                ),
            );
            const rotorSyncError = Math.abs(
              THREE.MathUtils.euclideanModulo(
                bodyRotorAngle - rotorAngle + Math.PI,
                TWO_PI,
              ) - Math.PI,
            );
            maxRotorSyncError = Math.max(
              maxRotorSyncError,
              rotorSyncError,
            );

            activeBallMesh.position.set(
              position.x,
              position.y,
              position.z,
            );
            const ballRotation = activeBallBody.rotation();
            activeBallMesh.quaternion.set(
              ballRotation.x,
              ballRotation.y,
              ballRotation.z,
              ballRotation.w,
            );
            maxVisualBodySyncError = Math.max(
              maxVisualBodySyncError,
              Math.hypot(
                activeBallMesh.position.x - position.x,
                activeBallMesh.position.y - position.y,
                activeBallMesh.position.z - position.z,
              ),
            );

            const planarDirection = new THREE.Vector3(
              velocity.x,
              0,
              velocity.z,
            );
            if (planarDirection.lengthSq() > 0.000001) {
              previousPlanarDirection =
                planarDirection.normalize();
            }
            previousSpeed = speed;
            previousTracePosition.set(position.x, position.y, position.z);
            previousTraceVelocity.set(velocity.x, velocity.y, velocity.z);

            if (
              step > 0 &&
              step % telemetryYieldSteps === 0
            ) {
              await yieldToBrowser();
              if (disposed) return;
            }

            if (settled || escaped || tunneling) break;
          }

          hover ||=
            maxUnsupportedTransitionFrames > hoverGraceFrames;

          if (
            impactSpeedAfter === null &&
            deflectorContactCount > 0
          ) {
            impactSpeedAfter = finalSpeed;
            impactDirectionAfter ??=
              previousPlanarDirection.clone();
          }

          const lapCount =
            trackAngleStart === null ||
            trackAngleEnd === null
              ? 0
              : Math.abs(trackAngleEnd - trackAngleStart) /
                TWO_PI;
          const trackDuration =
            inwardTransitionTime ?? elapsed;
          const trackContactRatio =
            trackFrames > 0
              ? trackContactFrames / trackFrames
              : 0;
          const speedDegradesAcrossLaps =
            lapSpeeds.length > 0 &&
            lapSpeeds.every(
              (speed, index) =>
                index === 0 ||
                speed <= lapSpeeds[index - 1] * 1.03,
            );
          const outerLapTargetMet =
            lapCount >= 4 && lapCount <= 5;
          const impactDirectionChangeDegrees =
            impactDirectionBefore && impactDirectionAfter
              ? THREE.MathUtils.radToDeg(
                  impactDirectionBefore.angleTo(
                    impactDirectionAfter,
                  ),
                )
              : null;

          const finalPosition = activeBallBody.translation();
          const finalRadius = Math.hypot(
            finalPosition.x,
            finalPosition.z,
          );
          if (
            pocketEntered &&
            finalRadius >= pocketResultCenterRadiusMin &&
            finalRadius <= pocketResultCenterRadiusMax
          ) {
            const finalAngle = normalizedAngle(
              Math.atan2(
                finalPosition.x,
                finalPosition.z,
              ) - rotorAngle,
            );
            finalPocketIndex =
              pocketIndexFromLocalPosition(
                Math.sin(finalAngle),
                Math.cos(finalAngle),
              );
            finalPocketNumber =
              EUROPEAN_SEQUENCE[finalPocketIndex];
          }

          const orderedCoreEvents = phases.filter(
            (event) => event.phase !== 'FRETS',
          );
          const observedPhaseIndices = orderedCoreEvents.map((event) =>
            phaseOrder.indexOf(event.phase),
          );
          const phaseSequenceMonotonic = observedPhaseIndices.every(
            (phaseIndex, index) =>
              index === 0 ||
              phaseIndex >= observedPhaseIndices[index - 1],
          );
          // Fret contact is physically possible but not mandatory: a ball can
          // enter a pocket cleanly between two separators. Keep FRETS optional
          // while still requiring the radial/settling chain to remain ordered.
          const requiredPhaseOrder: Part6SpinPhase[] = [
            'OUTER_RACE',
            'INWARD_DESCENT',
            'DEFLECTOR_ZONE',
            'ROTOR_ENTRY',
            'POCKET',
            'SETTLED',
          ];
          const deepestRequiredPhase = requiredPhaseOrder.reduce(
            (deepest, phase, index) =>
              recordedPhases.has(phase) ? Math.max(deepest, index) : deepest,
            -1,
          );
          const noSkippedRequiredPhases =
            deepestRequiredPhase < 0 ||
            requiredPhaseOrder
              .slice(0, deepestRequiredPhase + 1)
              .every((phase) => recordedPhases.has(phase));
          const fretEventIndex = phases.findIndex(
            (event) => event.phase === 'FRETS',
          );
          const rotorEntryEventIndex = phases.findIndex(
            (event) => event.phase === 'ROTOR_ENTRY',
          );
          const optionalFretPlacementValid =
            fretEventIndex < 0 ||
            (rotorEntryEventIndex >= 0 &&
              fretEventIndex > rotorEntryEventIndex);
          const phaseSequenceValid =
            phases[0]?.phase === 'OUTER_RACE' &&
            phaseSequenceMonotonic &&
            noSkippedRequiredPhases &&
            optionalFretPlacementValid;
          const timedOut =
            !settled &&
            !escaped &&
            !tunneling &&
            elapsed >=
              activePart6MaxDurationSeconds -
                FIXED_TIMESTEP;
          const settledResultContractValid =
            !settled ||
            (finalPocketIndex !== null &&
              finalPocketNumber !== null);
          const safetyPassed =
            stateResetVerified &&
            phaseSequenceValid &&
            settledResultContractValid &&
            !timedOut &&
            !hover &&
            !clipping &&
            !tunneling &&
            !escaped &&
            !velocitySpike &&
            !artificialAcceleration;
          const telemetryComplete =
            stateResetVerified &&
            Number.isFinite(elapsed) &&
            Number.isFinite(lapCount) &&
            Number.isFinite(minRadius) &&
            Number.isFinite(maxRadius) &&
            Number.isFinite(finalSpeed) &&
            Number.isFinite(finalRotorRelativeSpeed);

          const result: Part6FullSpinTelemetryResult = {
            id: run.id,
            seed: run.seed,
            label: run.label,
            launchAzimuth: Number(
              run.launchAzimuth.toFixed(6),
            ),
            launchSpeed: Number(run.speed.toFixed(4)),
            launchSpeedMetersPerSecond: Number(
              (run.speed / ROULETTE_WORLD_UNITS_PER_METER).toFixed(4),
            ),
            launchRadius: Number(
              Math.hypot(
                launchPosition.x,
                launchPosition.z,
              ).toFixed(4),
            ),
            launchHeight: Number(
              launchPosition.y.toFixed(4),
            ),
            rotorStartAngle: Number(
              run.rotorStartAngle.toFixed(6),
            ),
            stateResetVerified,
            resetPositionError: Number(resetPositionError.toFixed(8)),
            resetVelocityError: Number(resetVelocityError.toFixed(8)),
            resetAngularVelocityError: Number(
              resetAngularVelocityError.toFixed(8),
            ),
            resetRotationError: Number(resetRotationError.toFixed(8)),
            resetRotorAngleError: Number(resetRotorAngleError.toFixed(8)),
            elapsed: Number(elapsed.toFixed(4)),
            lapCount: Number(lapCount.toFixed(3)),
            trackDuration: Number(
              trackDuration.toFixed(4),
            ),
            trackContactRatio: Number(
              trackContactRatio.toFixed(4),
            ),
            trackStartSpeed: Number(
              trackStartSpeed.toFixed(4),
            ),
            trackEndSpeed: Number(
              trackEndSpeed.toFixed(4),
            ),
            peakSpeed: Number(peakSpeed.toFixed(4)),
            lapSpeeds: lapSpeeds.map((speed) =>
              Number(speed.toFixed(4)),
            ),
            speedDegradesAcrossLaps,
            outerLapTargetMet,
            minRadius: Number(minRadius.toFixed(4)),
            maxRadius: Number(maxRadius.toFixed(4)),
            inwardTransitionTime:
              inwardTransitionTime === null
                ? null
                : Number(
                    inwardTransitionTime.toFixed(4),
                  ),
            inwardTransitionRadius:
              inwardTransitionRadius === null
                ? null
                : Number(
                    inwardTransitionRadius.toFixed(4),
                  ),
            phases,
            phaseSequenceValid,
            transitionMinRadius: Number.isFinite(
              transitionMinRadius,
            )
              ? Number(transitionMinRadius.toFixed(4))
              : null,
            transitionMaxRadius: Number.isFinite(
              transitionMaxRadius,
            )
              ? Number(transitionMaxRadius.toFixed(4))
              : null,
            transitionMinY: Number.isFinite(transitionMinY)
              ? Number(transitionMinY.toFixed(4))
              : null,
            transitionMaxY: Number.isFinite(transitionMaxY)
              ? Number(transitionMaxY.toFixed(4))
              : null,
            transitionMaxSurfacePenetration: Number(
              transitionMaxSurfacePenetration.toFixed(4),
            ),
            transitionMaxSurfaceSeparation: Number(
              transitionMaxSurfaceSeparation.toFixed(4),
            ),
            transitionContactRoles:
              [...transitionContactRoles].sort(),
            maxUnsupportedTransitionDuration: Number(
              (
                maxUnsupportedTransitionFrames *
                FIXED_TIMESTEP
              ).toFixed(4),
            ),
            rotorEntryTime:
              rotorEntryTime === null
                ? null
                : Number(rotorEntryTime.toFixed(4)),
            deflectorContactCount,
            firstDeflectorContactTime:
              firstDeflectorContactTime === null
                ? null
                : Number(
                    firstDeflectorContactTime.toFixed(4),
                  ),
            impactSpeedBefore:
              impactSpeedBefore === null
                ? null
                : Number(impactSpeedBefore.toFixed(4)),
            impactSpeedAfter:
              impactSpeedAfter === null
                ? null
                : Number(impactSpeedAfter.toFixed(4)),
            impactDirectionChangeDegrees:
              impactDirectionChangeDegrees === null
                ? null
                : Number(
                    impactDirectionChangeDegrees.toFixed(2),
                  ),
            fretContact,
            firstFretContactTime:
              firstFretContactTime === null
                ? null
                : Number(
                    firstFretContactTime.toFixed(4),
                  ),
            pocketEntered,
            pocketEntryTime:
              pocketEntryTime === null
                ? null
                : Number(pocketEntryTime.toFixed(4)),
            settled,
            settleTime:
              settleTime === null
                ? null
                : Number(settleTime.toFixed(4)),
            finalPocketIndex,
            finalPocketNumber,
            finalSpeed: Number(finalSpeed.toFixed(4)),
            finalRotorRelativeSpeed: Number(
              finalRotorRelativeSpeed.toFixed(4),
            ),
            hover,
            clipping,
            tunneling,
            escaped,
            velocitySpike,
            artificialAcceleration,
            maxTrackPenetration: Number(
              maxTrackPenetration.toFixed(4),
            ),
            maxTrackSeparation: Number(
              maxTrackSeparation.toFixed(4),
            ),
            maxPocketFloorPenetration: Number(
              maxPocketFloorPenetration.toFixed(4),
            ),
            maxPocketFloorSeparation: Number(
              maxPocketFloorSeparation.toFixed(4),
            ),
            maxVisualBodySyncError: Number(
              maxVisualBodySyncError.toFixed(6),
            ),
            maxRotorSyncError: Number(
              maxRotorSyncError.toFixed(6),
            ),
            timedOut,
            safetyPassed,
            telemetryComplete,
            detail:
              'seed ' +
              String(run.seed) +
              ': ' +
              (timedOut
                ? 'telemetry captured but the chain did not settle before timeout'
                : settled
                  ? 'full chain settled'
                  : escaped || tunneling
                    ? 'safety failure recorded; batch continued'
                    : 'full chain telemetry captured'),
          };
          results.push(result);
          console.info(
            'PART6_SEED_TELEMETRY',
            JSON.stringify(result),
          );

          publishPart6TelemetryReport(
            summarize(
              results,
              'running',
              'PART 6A.1 captured ' +
                String(results.length) +
                '/' +
                String(activePart6Runs.length) +
                ' deterministic runs; remaining seeds continue.',
            ),
          );
          await yieldToBrowser();
          if (disposed) return;
        }

        const telemetryCaptured =
          results.length === activePart6Runs.length &&
          results.every(
            (result) => result.telemetryComplete,
          );
        const report = summarize(
          results,
          telemetryCaptured ? 'captured' : 'failed',
          telemetryCaptured
            ? 'PART 6A.1 telemetry captured all ' +
                String(results.length) +
                ' deterministic full-spin runs. Safety and lap calibration are reported in the status fields.'
            : 'PART 6A.1 telemetry did not capture every deterministic run.',
        );

        if (results.length > 0) {
          const lastRun =
            activePart6Runs[
              activePart6Runs.length - 1
            ];
          rotorAngleRef.current = normalizedAngle(
            lastRun.rotorStartAngle +
              TEST_ANGULAR_SPEED *
                (results[results.length - 1]?.elapsed ?? 0),
          );
          activeRotorPivot?.rotation.set(
            0,
            rotorAngleRef.current,
            0,
          );
          setAngleReadout(rotorAngleRef.current);
        }

        publishPart6TelemetryReport(report);
        console.info(
          'PART6_FULL_SPIN_TELEMETRY',
          JSON.stringify(report),
        );
        callbacksRef.current.onStateChange(
          report.status === 'captured'
            ? 'loaded'
            : 'error',
          report.detail,
          report.status === 'captured'
            ? undefined
            : 'telemetry',
        );
      } catch (error) {
        if (disposed) return;
        const detail =
          'PART 6 telemetry execution failed: ' +
          (error instanceof Error
            ? error.message
            : String(error));
        failInfrastructure(detail, 'telemetry', results);
      } finally {
        if (!disposed) {
          activeBallBody.setTranslation(
            previewSnapshot.ballTranslation,
            true,
          );
          activeBallBody.setRotation(
            previewSnapshot.ballRotation,
            true,
          );
          activeBallBody.setLinvel(
            previewSnapshot.ballLinvel,
            true,
          );
          activeBallBody.setAngvel(
            previewSnapshot.ballAngvel,
            true,
          );
          activeRotorBody.setRotation(
            previewSnapshot.rotorRotation,
            true,
          );
          activeRotorBody.setNextKinematicRotation(
            previewSnapshot.rotorRotation,
          );
          rotorAngleRef.current = previewSnapshot.rotorAngle;
          activeRotorPivot?.rotation.set(
            0,
            previewSnapshot.rotorPivotAngle,
            0,
          );
          activeBallMesh.position.copy(
            previewSnapshot.ballMeshPosition,
          );
          activeBallMesh.quaternion.copy(
            previewSnapshot.ballMeshQuaternion,
          );
          activeBallMesh.visible = previewSnapshot.ballMeshVisible;
          setAngleReadout(previewSnapshot.rotorAngle);
          callbacksRef.current.onRotorAngleChange(
            previewSnapshot.rotorAngle,
          );
        }
        part6TelemetryBatchRunning = false;
      }
    };

    const publishPart4Report = (
      status: Part4ValidationReport['status'],
      detail: string,
      results = part4Results,
    ) => {
      setPart4Report({
        status,
        results,
        ccdEnabled,
        kinematicRotor: Boolean(rotorBody),
        detail,
      });
    };

    const startPart3Probe = (index: number) => {
      const probe = PART3_PROBES[index];
      if (!probe || !ballBody || !ballMesh) return;
      const measuredDeflector =
        probe.kind === 'deflector-approach'
          ? part4DeflectorAudit?.descriptors[0] ?? null
          : null;
      if (probe.kind === 'deflector-approach' && !measuredDeflector) {
        publishPart3Report(
          'failed',
          'PART 4 deflector approach cannot start because no measured visible deflector is available.',
        );
        return;
      }
      const position = part3SpawnPosition(
        probe,
        part3TrackVerticalOffset,
        measuredDeflector,
      );
      const velocity = part3InitialVelocity(
        probe,
        measuredDeflector?.angle ?? null,
      );
      ballBody.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
      ballBody.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
      const angularSpin = part3InitialAngularSpin(probe);
      ballBody.setAngvel({ x: angularSpin.x, y: angularSpin.y, z: angularSpin.z }, true);
      ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ballMesh.position.set(...position);
      ballMesh.quaternion.identity();
      part3ProbeIndex = index;
      part3Elapsed = 0;
      part3PeakSpeed = 0;
      const actualSpawnRadius = Math.hypot(position[0], position[2]);
      part3MinRadius = actualSpawnRadius;
      part3MaxRadius = actualSpawnRadius;
      part3MaxPenetration = 0;
      part3MaxSeparation = 0;
      part3ContactFrames = 0;
      part3SampleFrames = 0;
      part3MaxVisualBodySyncError = 0;
      part3LeftValidVolume = false;
      part3TrackAngle = null;
      part3TrackAngleStart = null;
      part3TrackAngleEnd = null;
      part3TrackContactFrames = 0;
      part3TrackSampleFrames = 0;
      part3TrackSpeedSum = 0;
      part3TrackStartSpeed = 0;
      part3TrackEndSpeed = 0;
      part3TrackLapSpeeds = [];
      part3TrackCompletedLaps = 0;
      part3InwardDescentTime = null;
      part3InwardDescentRadius = null;
      part3ArtificialAcceleration = false;
      part3Hover = false;
      part3Clipping = false;
      part3BouncePlausible = true;
      part3PreviousSpeed = probe.speed;
      part3DeflectorContact = false;
      part3DeflectorContactTime = null;
      part3ImpactSpeedBefore = null;
      part3ImpactSpeedAfter = null;
      part3ImpactDirectionBefore = null;
      part3ImpactDirectionAfter = null;
      part3EarlyLapMinimumDeflectorClearance = null;
      part3DeflectorPassThrough = false;
      publishPart3Report(
        'running',
        `Running probe ${index + 1}/${PART3_PROBES.length}: ${probe.label}.`,
      );
    };

    const startPart3PocketProbe = () => {
      if (!ballBody || !ballMesh) return;
      const targetAngle = normalizedAngle(
        rotorAngleRef.current +
          PART3_POCKET_TARGET_INDEX * POCKET_STEP_RADIANS,
      );
      const position = radialPosition(
        PART3_POCKET_PROBE_RADIUS,
        targetAngle,
        POCKET_FLOOR_Y + BALL_RADIUS + 0.16,
      );
      const tangentialSpeed =
        TEST_ANGULAR_SPEED * PART3_POCKET_PROBE_RADIUS + 0.02;
      const velocity = {
        x: Math.cos(targetAngle) * tangentialSpeed,
        y: -0.22,
        z: -Math.sin(targetAngle) * tangentialSpeed,
      };
      ballBody.setTranslation(
        { x: position[0], y: position[1], z: position[2] },
        true,
      );
      ballBody.setLinvel(velocity, true);
      ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ballMesh.position.set(...position);
      ballMesh.quaternion.identity();
      part3PocketRunning = true;
      part3PocketElapsed = 0;
      part3PocketPeakSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
      part3PocketMaxPenetration = 0;
      part3PocketMaxSeparation = 0;
      part3PocketMaxRotorSyncError = 0;
      part3PocketMaxVisualBodySyncError = 0;
      part3PocketSettledFrames = 0;
      part3PocketEntered = false;
      part3PocketFretContact = false;
      part3PocketFirstFretContactSpeed = null;
      part3PocketBlockingColliderHandle = null;
      part3PocketBlockingColliderType = null;
      part3PocketBlockingContactTime = null;
      part3PocketPreviousSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
      part3PocketArtificialEnergyInjection = false;
      part3PocketLeftValidVolume = false;
      part3PocketTunneled = false;
      part3PocketReport = {
        status: 'running',
        label: 'Main-world number-slot descent',
        targetPocketIndex: PART3_POCKET_TARGET_INDEX,
        targetPocketNumber: EUROPEAN_SEQUENCE[PART3_POCKET_TARGET_INDEX],
        blockingColliderHandle: null,
        blockingColliderType: null,
        preFixBlockingColliderHandle: PART3_PREFIX_BLOCKING_COLLIDER_HANDLE,
        preFixBlockingColliderType: PART3_PREFIX_BLOCKING_COLLIDER_TYPE,
        blockingColliderFirstContactTime: null,
        correctedTransitionRadius: PART3_POCKET_TRANSITION_RADIUS,
        pocketFloorIntegrated: part3PocketColliders.length > 0,
        fretColliderCount: part3PocketColliders.filter(
          (collider) =>
            part3ColliderRoles.get(collider.handle) === 'pocket-fret-cuboid',
        ).length,
        enteredPocketVolume: false,
        fretContact: false,
        peakSpeedAtFretContact: null,
        maxPenetration: 0,
        maxSeparation: 0,
        settled: false,
        settledFrames: 0,
        finalRadius: PART3_POCKET_PROBE_RADIUS,
        finalHeight: position[1],
        finalSpeed: part3PocketPeakSpeed,
        finalRotorRelativeSpeed: part3PocketPeakSpeed,
        finalPocketIndex: null,
        finalPocketNumber: null,
        escaped: false,
        tunneled: false,
        hover: false,
        velocityExplosion: false,
        artificialEnergyInjection: false,
        maxRotorSyncError: 0,
        maxVisualBodySyncError: 0,
        detail: 'Running one controlled descent in the main real-spin Rapier world…',
      };
      publishPart3Report(
        'running',
        'Outer-track probes passed; running the main-world number-slot descent probe.',
      );
    };

    const startPart4Probe = (index: number) => {
      const probe = PART4_PROBES[index];
      if (!probe || !ballBody || !ballMesh || !rotorBody) return;
      const position = part4SpawnPosition(probe);
      const velocity = part4InitialVelocity(probe);
      const rotorAngleNow = normalizedAngle(rotorAngleRef.current);
      rotorBody.setRotation(
        { x: 0, y: Math.sin(rotorAngleNow / 2), z: 0, w: Math.cos(rotorAngleNow / 2) },
        true,
      );
      ballBody.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
      ballBody.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
      ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      ballMesh.position.set(...position);
      ballMesh.quaternion.identity();
      part4ProbeIndex = index;
      part4Elapsed = 0;
      part4InitialSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
      part4PeakSpeed = part4InitialSpeed;
      part4MinRadius = probe.radius;
      part4MaxRadius = probe.radius;
      part4MaxPenetration = 0;
      part4MaxSeparation = 0;
      part4ContactFrames = 0;
      part4SampleFrames = 0;
      part4MaxVisualBodySyncError = 0;
      part4MaxRotorSyncError = 0;
      part4MaxEnergyGain = 0;
      part4OutsideTurretStationary = true;
      part4LeftValidVolume = false;
      publishPart4Report(
        'running',
        `Running probe ${index + 1}/${PART4_PROBES.length}: ${probe.label}.`,
      );
    };

    const runPart3GeometryDiagnostic = () => {
      const radialProfile = sampleActualGeometryProfile();
      const azimuths = [
        ...new Set(radialProfile.map((sample) => sample.azimuth)),
      ];
      const perAzimuth = azimuths.map((azimuth) => {
        const samples = radialProfile.filter(
          (sample) => sample.azimuth === azimuth,
        );
        const outsideSamples = samples.filter((sample) =>
          sample.hits.some(
            (hit) => hit.objectName === 'geo1_outside_0',
          ),
        );
        const outsideHits = (sample: Part3GeometryProfileSample) =>
          sample.hits.filter(
            (hit) => hit.objectName === 'geo1_outside_0',
          );
        const nearDuplicateSamples = outsideSamples.filter((sample) => {
          const hits = outsideHits(sample);
          if (hits.length < 2) return false;
          const yValues = hits.map((hit) => hit.y);
          return (
            Math.max(...yValues) - Math.min(...yValues) <= 0.08 &&
            Math.min(...yValues) < -0.2 &&
            sample.radius > 2
          );
        });
        const woodSamples = outsideSamples.filter((sample) =>
          outsideHits(sample).some(
            (hit) => hit.y > -0.1 && sample.radius > 2.3,
          ),
        );
        const lastInnerLip =
          nearDuplicateSamples[nearDuplicateSamples.length - 1];
        const darkSamples: Part3GeometryProfileSample[] = [];
        let darkBranchStarted = false;
        if (lastInnerLip !== undefined) {
          for (const sample of outsideSamples) {
            if (sample.radius <= lastInnerLip.radius) continue;
            const hasLowTrackHit = outsideHits(sample).some(
              (hit) => hit.y < -0.1,
            );
            if (hasLowTrackHit) {
              darkBranchStarted = true;
              darkSamples.push(sample);
            } else if (darkBranchStarted) {
              break;
            }
          }
        }
        return {
          darkInner: lastInnerLip
            ? Number((lastInnerLip.radius + 0.01).toFixed(4))
            : null,
          darkOuter: darkSamples.length
            ? darkSamples[darkSamples.length - 1].radius
            : null,
          darkY: darkSamples.flatMap((sample) =>
            outsideHits(sample)
              .filter((hit) => hit.y < -0.1)
              .map((hit) => hit.y),
          ),
          woodInner: woodSamples.length ? woodSamples[0].radius : null,
          woodOuter: woodSamples.length
            ? woodSamples[woodSamples.length - 1].radius
            : null,
          deflectorInner: nearDuplicateSamples.length
            ? nearDuplicateSamples[0].radius
            : null,
          deflectorOuter: nearDuplicateSamples.length
            ? lastInnerLip.radius
            : null,
        };
      });
      const validMeasures = perAzimuth.filter(
        (measure) =>
          measure.darkInner !== null &&
          measure.darkOuter !== null &&
          measure.woodInner !== null &&
          measure.woodOuter !== null &&
          measure.deflectorInner !== null &&
          measure.deflectorOuter !== null,
      );
      const darkInner = validMeasures.length
        ? Math.max(...validMeasures.map((measure) => measure.darkInner!))
        : null;
      const darkOuter = validMeasures.length
        ? Math.min(...validMeasures.map((measure) => measure.darkOuter!))
        : null;
      const woodInner = validMeasures.length
        ? Math.min(...validMeasures.map((measure) => measure.woodInner!))
        : null;
      const woodOuter = validMeasures.length
        ? Math.max(...validMeasures.map((measure) => measure.woodOuter!))
        : null;
      const deflectorInner = validMeasures.length
        ? Math.min(
            ...validMeasures.map((measure) => measure.deflectorInner!),
          )
        : null;
      const deflectorOuter = validMeasures.length
        ? Math.max(
            ...validMeasures.map((measure) => measure.deflectorOuter!),
          )
        : null;
      const darkSurfaceYValues = validMeasures.flatMap(
        (measure) => measure.darkY,
      );
      const effectiveDeflectorInner =
        part4MeasuredDeflectorInnerRadius ?? deflectorInner;
      const effectiveDeflectorOuter =
        part4MeasuredDeflectorOuterRadius ?? deflectorOuter;
      const proposedLaunchRadius =
        darkOuter !== null &&
        woodInner !== null &&
        effectiveDeflectorOuter !== null
          ? Number(
              Math.min(
                Math.floor(
                  (woodInner - BALL_RADIUS - 0.02) * 100,
                ) / 100,
                darkOuter - 0.02,
              ).toFixed(4),
            )
          : null;
      const proposedSample =
        proposedLaunchRadius === null
          ? null
          : radialProfile
              .filter(
                (sample) =>
                  sample.azimuth === azimuths[0] &&
                  Math.abs(sample.radius - proposedLaunchRadius) <= 0.0051,
              )
              .sort(
                (left, right) =>
                  Math.abs(left.radius - proposedLaunchRadius) -
                  Math.abs(right.radius - proposedLaunchRadius),
              )[0] ?? null;
      const proposedTrackHit =
        proposedSample?.hits
          .filter(
            (hit) =>
              hit.objectName === 'geo1_outside_0' &&
              hit.y < -0.1,
          )
          .sort((left, right) => left.y - right.y)[0] ?? null;
      const proposedLaunchHeight =
        proposedTrackHit && ballBody
          ? proposedTrackHit.y + BALL_RADIUS + 0.0005
          : null;
      let staticVisibleContact = false;
      let staticOnDarkTrack = false;
      let staticOnWood = false;
      let staticInsideWheel = false;
      let staticHover = false;
      if (
        world &&
        ballBody &&
        physicsBallCollider &&
        part3TrackCollider &&
        proposedLaunchRadius !== null &&
        proposedLaunchHeight !== null
      ) {
        const launchPosition = radialPosition(
          proposedLaunchRadius,
          azimuths[0],
          proposedLaunchHeight,
        );
        ballBody.setTranslation(
          {
            x: launchPosition[0],
            y: launchPosition[1],
            z: launchPosition[2],
          },
          true,
        );
        ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        ballMesh?.position.set(...launchPosition);
        for (let step = 0; step < 6; step += 1) world.step();
        world.contactPairsWith(physicsBallCollider, (otherCollider) => {
          if (otherCollider.handle === part3TrackCollider?.handle) {
            staticVisibleContact = true;
          }
        });
        const finalPosition = ballBody.translation();
        const finalBottom = finalPosition.y - BALL_RADIUS;
        const surfaceY = proposedTrackHit?.y ?? 0;
        staticOnDarkTrack =
          proposedLaunchRadius >= (darkInner ?? Number.POSITIVE_INFINITY) &&
          proposedLaunchRadius <= (darkOuter ?? Number.NEGATIVE_INFINITY) &&
          Math.abs(finalBottom - surfaceY) <= 0.02;
        staticOnWood =
          proposedLaunchRadius + BALL_RADIUS >= (woodInner ?? Infinity);
        staticInsideWheel =
          proposedLaunchRadius - BALL_RADIUS <=
          (effectiveDeflectorOuter ?? -Infinity);
        staticHover = finalBottom - surfaceY > 0.02;
      }
      const passed =
        validMeasures.length === azimuths.length &&
        staticVisibleContact &&
        staticOnDarkTrack &&
        !staticOnWood &&
        !staticInsideWheel &&
        !staticHover &&
        (woodInner === null ||
          proposedLaunchRadius === null ||
          woodInner -
            proposedLaunchRadius -
            BALL_RADIUS >=
            0.02) &&
        (effectiveDeflectorOuter === null ||
          proposedLaunchRadius === null ||
          proposedLaunchRadius -
            effectiveDeflectorOuter -
            BALL_RADIUS >=
            0.02);
      console.info(
        'PART_C_GEOMETRY_PROFILE',
        JSON.stringify({ perAzimuth, proposedLaunchRadius }),
      );
      publishPart3GeometryDiagnosticReport({
        status: passed ? 'passed' : 'failed',
        trueDarkTrackInnerRadius: darkInner,
        trueDarkTrackOuterRadius: darkOuter,
        trueDarkTrackCenterRadius:
          darkInner !== null && darkOuter !== null
            ? Number(((darkInner + darkOuter) / 2).toFixed(4))
            : null,
        darkTrackSurfaceYRange:
          darkSurfaceYValues.length > 0
            ? [
                Number(Math.min(...darkSurfaceYValues).toFixed(4)),
                Number(Math.max(...darkSurfaceYValues).toFixed(4)),
              ]
            : null,
        outerWoodRingRadiusBand:
          woodInner !== null && woodOuter !== null
            ? [woodInner, woodOuter]
            : null,
        nearestDeflectorRadiusBand:
          effectiveDeflectorInner !== null &&
          effectiveDeflectorOuter !== null
            ? [
                Number(effectiveDeflectorInner.toFixed(4)),
                Number(effectiveDeflectorOuter.toFixed(4)),
              ]
            : null,
        visibleDeflectorCount:
          part4DeflectorAudit?.descriptors.length ?? null,
        visibleDeflectorAnglesDegrees:
          part4DeflectorAudit?.descriptors.map((descriptor) =>
            Number(
              THREE.MathUtils.radToDeg(descriptor.angle).toFixed(3),
            ),
          ) ?? [],
        visibleDeflectorAuditPassed:
          part4DeflectorAudit?.passed ?? false,
        proposedLaunchRadius,
        proposedLaunchHeight,
        ballRadius: BALL_RADIUS,
        rimClearance:
          woodInner !== null && proposedLaunchRadius !== null
            ? Number(
                (
                  woodInner -
                  proposedLaunchRadius -
                  BALL_RADIUS
                ).toFixed(4),
              )
            : null,
        deflectorClearance:
          effectiveDeflectorOuter !== null &&
          proposedLaunchRadius !== null
            ? Number(
                (
                  proposedLaunchRadius -
                  effectiveDeflectorOuter -
                  BALL_RADIUS
                ).toFixed(4),
              )
            : null,
        staticVisibleContact,
        staticOnDarkTrack,
        staticOnWood,
        staticInsideWheel,
        staticHover,
        radialProfile,
        detail: passed
          ? 'PART C remains interrupted; geometry diagnostic PASS only. True dark-track placement is ready for a separate future spin task; no lap tuning ran.'
          : 'PART C remains interrupted; geometry diagnostic FAIL. No lap tuning or production path ran.',
      });
    };

    const completePart3OuterLaneSpin = (
      position: RAPIER.Vector,
      velocity: RAPIER.Vector,
    ) => {
      const run = PART3_OUTER_SPIN_RUNS[part3OuterLaneSpinIndex];
      if (!run) return;
      const lapCount =
        part3OuterLaneSpinTrackAngleStart === null ||
        part3OuterLaneSpinTrackAngleEnd === null
          ? 0
          : Math.abs(
              part3OuterLaneSpinTrackAngleEnd -
                part3OuterLaneSpinTrackAngleStart,
            ) / TWO_PI;
      const contactRatio =
        part3OuterLaneSpinTrackFrames > 0
          ? part3OuterLaneSpinContactFrames /
            part3OuterLaneSpinTrackFrames
          : 0;
      const continuousTrackContact = contactRatio >= 0.94;
      const averageRollingMismatch =
        part3OuterLaneSpinRollingSamples > 0
          ? part3OuterLaneSpinRollingMismatchSum /
            part3OuterLaneSpinRollingSamples
          : Number.POSITIVE_INFINITY;
      const rollingOrSlidingCoherent =
        Number.isFinite(averageRollingMismatch) &&
        averageRollingMismatch <= 0.65;
      const finalSpeed = Math.hypot(
        velocity.x,
        velocity.y,
        velocity.z,
      );
      const readyForInwardDescent =
        finalSpeed <= run.speed * 0.75 &&
        finalSpeed >= 0.05 &&
        part3OuterLaneSpinMinDeflectorClearance >=
          PART3_OUTER_LANE_CLEARANCE_MARGIN &&
        position.y > COLLIDER_PROFILE.innerFloorTop - BALL_RADIUS;
      const stable =
        lapCount >= 3.5 &&
        lapCount <= 5.5 &&
        continuousTrackContact &&
        part3OuterLaneSpinEndSpeed <
          part3OuterLaneSpinStartSpeed * 0.98 &&
        rollingOrSlidingCoherent &&
        part3OuterLaneSpinInwardTransitionTime !== null &&
        readyForInwardDescent &&
        !part3OuterLaneSpinWoodContact &&
        !part3OuterLaneSpinHover &&
        !part3OuterLaneSpinClipping &&
        !part3OuterLaneSpinTunneling &&
        !part3OuterLaneSpinEscaped &&
        !part3OuterLaneSpinVelocitySpike &&
        !part3OuterLaneSpinArtificialAcceleration &&
        part3OuterLaneSpinMinRimClearance >= 0.02 &&
        part3OuterLaneSpinMinDeflectorClearance >= 0.02 &&
        part3OuterLaneSpinMaxVisualBodySyncError <= 0.000001 &&
        part3OuterLaneSpinMaxRotorSyncError <= 0.001;
      const result: Part3OuterLaneSpinResult = {
        id: run.id,
        label: run.label,
        launchSpeed: run.speed,
        initialAngularSpin: {
          x: Number(
            ((-Math.sin(0.37) * run.speed) / BALL_RADIUS).toFixed(4),
          ),
          y: 0,
          z: Number(
            ((-Math.cos(0.37) * run.speed) / BALL_RADIUS).toFixed(4),
          ),
        },
        lapCount: Number(lapCount.toFixed(3)),
        trackDuration: Number(part3OuterLaneSpinElapsed.toFixed(4)),
        peakSpeed: Number(part3OuterLaneSpinPeakSpeed.toFixed(4)),
        averageTrackSpeed: Number(
          (
            part3OuterLaneSpinTrackFrames > 0
              ? part3OuterLaneSpinSpeedSum /
                part3OuterLaneSpinTrackFrames
              : 0
          ).toFixed(4),
        ),
        endSpeed: Number(finalSpeed.toFixed(4)),
        speedTrendByLap: part3OuterLaneSpinLapSpeeds.map((speed) =>
          Number(speed.toFixed(4)),
        ),
        minRadius: Number(part3OuterLaneSpinMinRadius.toFixed(4)),
        maxRadius: Number(part3OuterLaneSpinMaxRadius.toFixed(4)),
        minimumRimClearance: Number(
          part3OuterLaneSpinMinRimClearance.toFixed(4),
        ),
        minimumDeflectorClearance: Number(
          part3OuterLaneSpinMinDeflectorClearance.toFixed(4),
        ),
        continuousTrackContact,
        rollingOrSlidingCoherent,
        readyForInwardDescent,
        naturalInwardTransition:
          part3OuterLaneSpinInwardTransitionTime !== null &&
          part3OuterLaneSpinInwardTransitionRadius !== null,
        inwardTransitionTime:
          part3OuterLaneSpinInwardTransitionTime === null
            ? null
            : Number(part3OuterLaneSpinInwardTransitionTime.toFixed(4)),
        inwardTransitionRadius:
          part3OuterLaneSpinInwardTransitionRadius === null
            ? null
            : Number(part3OuterLaneSpinInwardTransitionRadius.toFixed(4)),
        woodContact: part3OuterLaneSpinWoodContact,
        hover: part3OuterLaneSpinHover,
        clipping: part3OuterLaneSpinClipping,
        tunneling: part3OuterLaneSpinTunneling,
        escaped: part3OuterLaneSpinEscaped,
        velocitySpike: part3OuterLaneSpinVelocitySpike,
        artificialAcceleration: part3OuterLaneSpinArtificialAcceleration,
        maxVisualBodySyncError: Number(
          part3OuterLaneSpinMaxVisualBodySyncError.toFixed(6),
        ),
        maxRotorSyncError: Number(
          part3OuterLaneSpinMaxRotorSyncError.toFixed(6),
        ),
        maxPenetration: Number(
          part3OuterLaneSpinMaxPenetration.toFixed(4),
        ),
        maxSeparation: Number(
          part3OuterLaneSpinMaxSeparation.toFixed(4),
        ),
        outcome: stable ? 'stable' : 'failed',
        detail: stable
          ? `Stable outer spin: ${lapCount.toFixed(2)} laps with gradual energy loss and no early deflector contact.`
          : `Outer spin failed: ${[
              lapCount < 3.5 || lapCount > 5.5 ? 'lap spread' : '',
              !continuousTrackContact ? 'contact continuity' : '',
              !rollingOrSlidingCoherent ? 'rolling/sliding mismatch' : '',
              part3OuterLaneSpinInwardTransitionTime === null
                ? 'no natural inward transition'
                : '',
              !readyForInwardDescent ? 'not ready for inward descent' : '',
              part3OuterLaneSpinWoodContact ? 'wood contact' : '',
              part3OuterLaneSpinHover ? 'hover' : '',
              part3OuterLaneSpinClipping ? 'clipping' : '',
              part3OuterLaneSpinTunneling ? 'tunneling' : '',
              part3OuterLaneSpinEscaped ? 'escape' : '',
              part3OuterLaneSpinVelocitySpike ? 'velocity spike' : '',
              part3OuterLaneSpinArtificialAcceleration
                ? 'artificial acceleration'
                : '',
            ]
              .filter(Boolean)
              .join(', ') || 'review required'}.`,
      };
      part3OuterLaneSpinResults = [
        ...part3OuterLaneSpinResults,
        result,
      ];
      if (part3OuterLaneSpinIndex < PART3_OUTER_SPIN_RUNS.length - 1) {
        startPart3OuterLaneSpin(part3OuterLaneSpinIndex + 1);
        return;
      }
      const typicalLapCount =
        part3OuterLaneSpinResults.reduce(
          (sum, spin) => sum + spin.lapCount,
          0,
        ) / part3OuterLaneSpinResults.length;
      const passed =
        part3OuterLaneSpinResults.length === PART3_OUTER_SPIN_RUNS.length &&
        part3OuterLaneSpinResults.every(
          (spin) => spin.outcome === 'stable',
        ) &&
        typicalLapCount >= 3.5 &&
        typicalLapCount <= 5.5;
      part3OuterLaneSpinRunning = false;
      publishPart3OuterLaneSpinReport({
        status: passed ? 'passed' : 'failed',
        trackFriction: PART3_OUTER_SPIN_TRACK_FRICTION,
        linearDamping: PART3_OUTER_SPIN_LINEAR_DAMPING,
        angularDamping: PART3_OUTER_SPIN_ANGULAR_DAMPING,
        fixedTimestep: FIXED_TIMESTEP,
        operationalLaunchRadius: part3OuterLaneLaunchRadius,
        launchHeight: position.y - BALL_RADIUS - 0.002,
        ballRadius: BALL_RADIUS,
        results: part3OuterLaneSpinResults,
        detail: passed
          ? `PART C PASS: three natural outer-track spins averaged ${typicalLapCount.toFixed(2)} laps before inward-descent readiness.`
          : `PART C FAIL: the three-spin smoke set averaged ${typicalLapCount.toFixed(2)} laps or violated a stability criterion.`,
      });
      callbacksRef.current.onStateChange(
        passed ? 'loaded' : 'error',
        passed
          ? 'PART C outer-track spin tuning passed'
          : 'PART C outer-track spin tuning failed',
        passed ? undefined : 'physics-validation',
      );
    };

    try {
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.08;
      } catch (rendererError) {
        renderer = null;
        console.warn(
          'WebGL renderer unavailable; continuing with browser physics validation.',
          rendererError,
        );
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#17252b');
      scene.fog = new THREE.Fog('#17252b', 11, 21);
      const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
      const applyView = (nextView: InspectionView) => {
        const preset = VIEW_PRESETS[nextView];
        camera.up.set(...preset.up);
        camera.position.set(...preset.position);
        controls?.target.set(0, 0, 0);
        controls?.update();
      };

      const keyLight = new THREE.DirectionalLight('#fff8df', 3.4);
      keyLight.position.set(4, 8, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight('#9fc7ca', 1.8);
      fillLight.position.set(-5, 3, -4);
      scene.add(fillLight);
      scene.add(new THREE.HemisphereLight('#b3d4d2', '#0e171b', 1.2));

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(8, 64),
        new THREE.MeshStandardMaterial({ color: '#1b2e33', roughness: 0.94, metalness: 0.05 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.48;
      scene.add(floor);

      const grid = new THREE.GridHelper(16, 16, '#567277', '#2f474d');
      grid.material.transparent = true;
      grid.material.opacity = 0.5;
      grid.visible = showGrid;
      scene.add(grid);

      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.minDistance = 4.2;
      controls.maxDistance = 14;
      applyView(viewRef.current);

      const loader = new GLTFLoader();
      loader.load(
        ROULETTE_RUNTIME_ASSET_PATH,
        async (gltf) => {
          if (disposed) return;
          const runtimeScene = gltf.scene.clone(true);
          const embeddedScaleNode = (() => {
            let found: THREE.Object3D | undefined;
            runtimeScene.traverse((child) => {
              if (
                !found &&
                Math.abs(child.scale.x - 0.01) < 0.000001 &&
                Math.abs(child.scale.y - 0.01) < 0.000001 &&
                Math.abs(child.scale.z - 0.01) < 0.000001
              ) {
                found = child;
              }
            });
            return found;
          })();
          if (!embeddedScaleNode) {
            throw new Error('PART 2 requires the embedded 0.01 GLB transform for scale normalization');
          }
          embeddedScaleNode.scale.set(1, 1, 1);
          runtimeScene.updateMatrixWorld(true);
          const sourceMeshCount = countMeshes(runtimeScene);
          const sourceTriangles = countTriangles(runtimeScene);
          const sourceCenter = new THREE.Vector3(
            ROULETTE_RAW_SOURCE_CENTER.x,
            ROULETTE_RAW_SOURCE_CENTER.y,
            ROULETTE_RAW_SOURCE_CENTER.z,
          );

          const outside = runtimeScene.getObjectByName('geo1_outside_0');
          const inside = runtimeScene.getObjectByName('geo1_inside_0');
          const turret = runtimeScene.getObjectByName('geo1_turret_0');
          if (!outside || !inside || !turret) {
            throw new Error('PART 2 requires geo1_outside_0, geo1_inside_0, and geo1_turret_0');
          }

          wheelRoot = new THREE.Group();
          wheelRoot.name = 'Part2__AuthoritativeWheelRoot';
          wheelRoot.position.set(0, ROULETTE_Y_ORIGIN, 0);
          wheelRoot.userData = {
            sourceAsset: ROULETTE_ASSET_PATH,
            authoritativeTransform: {
              sourceCenter: ROULETTE_RAW_SOURCE_CENTER,
              normalizedCenter: { x: 0, y: 0, z: 0 },
              diameter: ROULETTE_NORMALIZED_DIAMETER,
              scale: ROULETTE_AUTHORITATIVE_SCALE,
              yOrigin: ROULETTE_Y_ORIGIN,
              rotationAxis: ROULETTE_ROTATION_AXIS,
            },
            part2Only: true,
            rawGlbUsedAsCollider: false,
          };
          const runtimeOffset = new THREE.Group();
          runtimeOffset.position.set(-sourceCenter.x, -sourceCenter.y, -sourceCenter.z);
          runtimeOffset.scale.setScalar(ROULETTE_AUTHORITATIVE_SCALE);
          runtimeOffset.add(runtimeScene);
          wheelRoot.add(runtimeOffset);
          wheelRoot.updateMatrixWorld(true);
          const normalizedBounds = new THREE.Box3().setFromObject(runtimeScene);
          runtimeOffset.position.sub(normalizedBounds.getCenter(new THREE.Vector3()));
          wheelRoot.updateMatrixWorld(true);

          stationaryGroup = new THREE.Group();
          stationaryGroup.name = 'Part2__StationaryOutsideAndTurret';
          rotorPivot = new THREE.Group();
          rotorPivot.name = 'Part2__RotorPivot__Y';
          rotorPivot.position.set(0, 0, 0);
          rotorPivot.rotation.set(0, rotorAngleRef.current, 0);
          const rotorGroup = new THREE.Group();
          rotorGroup.name = 'Part2__InsideRotorVisual';
          rotorPivot.add(rotorGroup);
          wheelRoot.add(stationaryGroup, rotorPivot);
          stationaryGroup.attach(outside);
          rotorGroup.attach(inside);
          stationaryGroup.attach(turret);
          stationaryBaselinePosition.copy(stationaryGroup.position);
          stationaryBaselineQuaternion.copy(stationaryGroup.quaternion);
          wheelRoot.remove(runtimeOffset);
          wheelRoot.updateMatrixWorld(true);
          scene.add(wheelRoot);

          const runtimeBounds = new THREE.Box3().setFromObject(wheelRoot);
          const runtimeSize = runtimeBounds.getSize(new THREE.Vector3());
          const json = gltf.parser.json as { asset?: { extras?: Record<string, string> } };
          const extras = json.asset?.extras ?? {};
          callbacksRef.current.onAudit({
            sourceMeshCount,
            sourceTriangles,
            runtimeMeshCount: countMeshes(stationaryGroup) + countMeshes(rotorGroup),
            runtimeTriangles: countTriangles(stationaryGroup) + countTriangles(rotorGroup),
            normalizationScale: ROULETTE_AUTHORITATIVE_SCALE,
            dimensions: roundedVector(runtimeSize),
            pivot: roundedVector(runtimeBounds.getCenter(new THREE.Vector3())),
            sourcePivot: ROULETTE_RAW_SOURCE_CENTER,
            sourceRoot: gltf.scene.name || 'Sketchfab_model',
            excludedGeometry: [],
            stationaryMeshCount: countMeshes(stationaryGroup),
            stationaryTriangles: countTriangles(stationaryGroup),
            rotorMeshCount: countMeshes(rotorGroup),
            rotorTriangles: countTriangles(rotorGroup),
            attribution: {
              author: extras.author ?? 'Unknown author',
              license: extras.license ?? 'Unknown license',
              source: extras.source ?? 'Source URL not provided',
            },
          });

          const measuredOuterWallProfile =
            measureVisibleOuterWallProfile();
          if (
            part6FullSpinRouteActive &&
            measuredOuterWallProfile.length < 4
          ) {
            throw new Error(
              'PART 6 requires the measured visible outer retaining wall before full-spin validation',
            );
          }

          part4DeflectorAudit = measureVisibleDeflectors();
          if (part4DeflectorAudit.descriptors.length > 0) {
            part4MeasuredDeflectorInnerRadius = Math.min(
              ...part4DeflectorAudit.descriptors.map(
                (descriptor) => descriptor.innerRadius,
              ),
            );
            part4MeasuredDeflectorOuterRadius = Math.max(
              ...part4DeflectorAudit.descriptors.map(
                (descriptor) => descriptor.outerRadius,
              ),
            );
          }
          console.info(
            'PART4_DEFLECTOR_AUDIT',
            JSON.stringify({
              passed: part4DeflectorAudit.passed,
              count: part4DeflectorAudit.descriptors.length,
              anglesDegrees: part4DeflectorAudit.descriptors.map(
                (descriptor) =>
                  Number(
                    THREE.MathUtils.radToDeg(descriptor.angle).toFixed(3),
                  ),
              ),
              innerRadius: part4MeasuredDeflectorInnerRadius,
              outerRadius: part4MeasuredDeflectorOuterRadius,
              prominenceThreshold:
                part4DeflectorAudit.prominenceThreshold,
              peakProminence: part4DeflectorAudit.peakProminence,
              maxSpacingDeviationRatio:
                part4DeflectorAudit.maxSpacingDeviationRatio,
              descriptors: part4DeflectorAudit.descriptors.map((descriptor) => ({
                angleDegrees: Number(
                  THREE.MathUtils.radToDeg(descriptor.angle).toFixed(3),
                ),
                innerRadius: descriptor.innerRadius,
                outerRadius: descriptor.outerRadius,
                bottomY: descriptor.bottomY,
                topY: descriptor.topY,
                angularWidth: descriptor.angularWidth,
              })),
            }),
          );

          await RAPIER.init();
          if (disposed) return;
          world = new RAPIER.World({ x: 0, y: GRAVITY_Y, z: 0 });
          world.timestep = FIXED_TIMESTEP;
          world.maxCcdSubsteps = ROULETTE_MAX_CCD_SUBSTEPS;
          const stationaryBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
            if (
              validationMode === 'part3' &&
              (outerLaneOnly || outerLaneSpinOnly)
            ) {
              const launchSample = radialPosition(
                PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS,
                0.37,
                0,
              );
              const darkTrackSurface = measureVisibleSurfaceAt(
                launchSample[0],
                launchSample[2],
                true,
                PART2_ACTUAL_DARK_TRACK_RADIUS_BAND,
              );
              if (!darkTrackSurface) {
                throw new Error(
                  'PART 2 could not measure the visible dark recessed race at the configured launch radius',
                );
              }
              part2RaceVerticalOffset =
                darkTrackSurface.y -
                part2ChannelSurfaceAt(PART2_ACTUAL_DARK_TRACK_LAUNCH_RADIUS).y;
              const channelMesh = makePart2RaceChannelTrimesh(
                part2RaceVerticalOffset,
                part6FullSpinRouteActive
                  ? PART2_ACTUAL_INWARD_EDGE_RADIUS + BALL_RADIUS
                  : null,
                part6FullSpinRouteActive
                  ? PART2_ACTUAL_WOOD_INNER_RADIUS
                  : null,
              );
              part3TrackCollider = world.createCollider(
                RAPIER.ColliderDesc.trimesh(
                  channelMesh.vertices,
                  channelMesh.indices,
                  RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES |
                    RAPIER.TriMeshFlags.ORIENTED,
                )
                  .setFriction(activePart3TrackFriction)
                  .setRestitution(0.01),
                stationaryBody,
              );
              part3ColliderRoles.set(
                part3TrackCollider.handle,
                'analytic-dark-recessed-channel',
              );

              const outerWall = addMeasuredOuterWallColliders(
                world,
                stationaryBody,
                measuredOuterWallProfile,
                activePart3TrackFriction,
                part2RaceVerticalOffset,
              );
              outerWall.colliders.forEach((collider) => {
                part3ColliderRoles.set(
                  collider.handle,
                  'measured-visible-outer-wall-cuboid',
                );
              });
              console.info(
                'PART6_OUTER_WALL_COLLIDER',
                JSON.stringify({
                  mode: 'measured-floor-vertical-wall',
                  colliderSegments: outerWall.segments,
                  primitiveColliderCount: outerWall.colliders.length,
                  colliderProfile: outerWall.samples,
                }),
              );
            } else if (
              validationMode === 'part3' &&
              !geometryDiagnosticOnly &&
              !part1ProbeOnly
            ) {
             const launchSample = radialPosition(PART3_LAUNCH_RADIUS, 0.37, 0);
             const darkTrackSurface = measureVisibleSurfaceAt(
               launchSample[0],
               launchSample[2],
               true,
               PART2_ACTUAL_DARK_TRACK_RADIUS_BAND,
             );
             if (!darkTrackSurface) {
               throw new Error(
                 'PART 3 could not measure the visible dark outer track inside the configured radius band',
               );
             }
             part3TrackVerticalOffset =
               darkTrackSurface.y - part3TrackHeightBase(PART3_LAUNCH_RADIUS);
             const outerTrackMesh = makePart3OuterTrackTrimesh(part3TrackVerticalOffset);
             part3TrackCollider = world.createCollider(
              RAPIER.ColliderDesc.trimesh(
                outerTrackMesh.vertices,
                outerTrackMesh.indices,
                RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.ORIENTED,
              )
                .setFriction(activePart3TrackFriction)
                .setRestitution(0.01),
              stationaryBody,
            );
             part3ColliderRoles.set(part3TrackCollider.handle, 'analytic-dark-recessed-channel');
           } else if (
             validationMode === 'part3' &&
             (geometryDiagnosticOnly || part1ProbeOnly)
           ) {
             const actualOutsideMesh = makeWorldTrimeshFromObject(outside);
             part3TrackCollider = world.createCollider(
               RAPIER.ColliderDesc.trimesh(
                 actualOutsideMesh.vertices,
                 actualOutsideMesh.indices,
                 RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES |
                   RAPIER.TriMeshFlags.ORIENTED,
               )
                 .setFriction(activePart3TrackFriction)
                 .setRestitution(0.01),
               stationaryBody,
             );
             part3ColliderRoles.set(
               part3TrackCollider.handle,
               'actual-glb-outside-trimesh',
             );
           } else {
            const profileMesh = makeProfileTrimesh();
            const profileCollider = RAPIER.ColliderDesc.trimesh(
              profileMesh.vertices,
              profileMesh.indices,
              RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.ORIENTED,
            )
              .setFriction(0.42)
              .setRestitution(0.02);
            world.createCollider(profileCollider, stationaryBody);
            addProfileSupportRings(world, stationaryBody);
            addRetainingRim(world, stationaryBody, 2.94, -0.02);
          }
           if (
             validationMode === 'part3' &&
             !geometryDiagnosticOnly &&
             !part1ProbeOnly &&
             part3TrackCollider
           ) {
             if (!part4DeflectorAudit?.passed) {
               throw new Error(
                 `PART 4 requires a credible visible-deflector audit before creating colliders: ${part4DeflectorAudit?.detail ?? 'audit unavailable'}`,
               );
             }
             part3DeflectorColliders = addMeasuredDeflectorColliders(
               world,
               stationaryBody,
               part4DeflectorAudit.descriptors,
             );
             for (const collider of part3DeflectorColliders) {
               part3ColliderRoles.set(
                 collider.handle,
                 'asset-measured-visible-deflector-cuboid',
               );
             }

             const activeTrackVerticalOffset =
               outerLaneOnly || outerLaneSpinOnly
                 ? part2RaceVerticalOffset
                 : part3TrackVerticalOffset;
             part3BowlBridgeOuterRadius = part6FullSpinRouteActive
               ? PART2_ACTUAL_INWARD_EDGE_RADIUS + BALL_RADIUS
               : BOWL_BRIDGE_OUTER_RADIUS;
             part3BowlBridgeProfile = measureBowlBridgeProfile(
               activeTrackVerticalOffset,
               part3BowlBridgeOuterRadius,
             );
             if (part6FullSpinRouteActive) {
               console.info(
                 'PART6_BOWL_BRIDGE_PROFILE',
                 JSON.stringify({
                   outerRadius: part3BowlBridgeOuterRadius,
                   profile: part3BowlBridgeProfile,
                 }),
               );
             }
             if (part6FullSpinRouteActive) {
               const bridgeMesh = buildBowlBridgeTrimesh(
                 part3BowlBridgeProfile,
               );
               const bridgeCollider = world.createCollider(
                 RAPIER.ColliderDesc.trimesh(
                   bridgeMesh.vertices,
                   bridgeMesh.indices,
                   RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES |
                     RAPIER.TriMeshFlags.ORIENTED,
                 )
                   .setFriction(activePart3TrackFriction)
                   .setRestitution(0.01)
                   .setCollisionGroups(
                     STATIONARY_COLLISION_GROUP |
                       (BALL_COLLISION_GROUP << 16),
                   ),
                 stationaryBody,
               );
               part3BowlBridgeColliders = [bridgeCollider];
             } else {
               part3BowlBridgeColliders = addBowlBridgePrimitiveColliders(
                 world,
                 stationaryBody,
                 part3BowlBridgeProfile,
                 activePart3TrackFriction,
               );
             }
             for (const collider of part3BowlBridgeColliders) {
               part3ColliderRoles.set(
                 collider.handle,
                 'stationary-bowl-apron-bridge',
               );
             }
           }

           if (validationMode !== 'part3') {
             part3InnerFloorCollider = world.createCollider(
               RAPIER.ColliderDesc.cylinder(1.88, 0.04)
                 .setTranslation(0, COLLIDER_PROFILE.innerFloorTop - 0.04, 0)
                 .setFriction(0.38)
                 .setRestitution(0.01),
               stationaryBody,
             );
           }
          world.createCollider(
            RAPIER.ColliderDesc.cylinder(0.34, COLLIDER_PROFILE.centerGuardRadius)
              .setTranslation(0, -0.10, 0)
              .setFriction(0.38)
              .setRestitution(0.01),
            stationaryBody,
          );

            if (validationMode === 'part3' || validationMode === 'part4') {
            const initialRotorAngle = normalizedAngle(rotorAngleRef.current);
            rotorBody = world.createRigidBody(
              RAPIER.RigidBodyDesc.kinematicPositionBased()
                .setTranslation(0, 0, 0)
                .setRotation({
                  x: 0,
                  y: Math.sin(initialRotorAngle / 2),
                  z: 0,
                  w: Math.cos(initialRotorAngle / 2),
                }),
            );
              if (validationMode === 'part3') {
               const activePocketOuterLipY =
                 part6FullSpinRouteActive &&
                 part3BowlBridgeProfile.length > 0
                   ? part3BowlBridgeProfile[0][1]
                   : POCKET_OUTER_LIP_Y;
               part3PocketColliders = addKinematicPocketSystem(
                 world,
                 rotorBody,
                 activePocketOuterLipY,
               );
               part3PocketColliders.forEach((collider, index) => {
                 part3ColliderRoles.set(
                   collider.handle,
                   index === 0
                     ? 'pocket-floor-trimesh'
                     : index === 1
                       ? 'pocket-outer-lip-trimesh'
                       : 'pocket-fret-cuboid',
                 );
               });
               const pocketInnerGuard = addKinematicPocketInnerGuard(
                 world,
                 rotorBody,
               );
               part3PocketColliders.push(pocketInnerGuard);
               part3ColliderRoles.set(
                 pocketInnerGuard.handle,
                 'pocket-inner-retaining-ring',
               );
               const pocketCatchFloor = world.createCollider(
                 RAPIER.ColliderDesc.cylinder(
                   0.04,
                   Math.max(
                     POCKET_FLOOR_OUTER_RADIUS + 0.06,
                     PART3_POCKET_PROBE_RADIUS + BALL_RADIUS + 0.02,
                   ),
                 )
                   .setTranslation(0, POCKET_FLOOR_Y - BALL_RADIUS - 0.04, 0)
                   .setFriction(0.42)
                   .setRestitution(0.02)
                   .setCollisionGroups(
                     ROTOR_COLLISION_GROUP | (BALL_COLLISION_GROUP << 16),
                   ),
                 rotorBody,
               );
               part3PocketColliders.push(pocketCatchFloor);
               part3ColliderRoles.set(
                 pocketCatchFloor.handle,
                 'pocket-floor-catch-underlay',
               );
             } else {
               rotorColliders = addKinematicRotorBand(world, rotorBody);
             }
          }

          const initialPosition =
            validationMode === 'part3'
               ? part3SpawnPosition(PART3_PROBES[0], part3TrackVerticalOffset)
              : validationMode === 'part4'
                ? part4SpawnPosition(PART4_PROBES[0])
                : DROP_INITIAL_POSITION;
          ballMesh = createBallVisual();
          ballMesh.visible = showBallPlaceholder;
          wheelRoot.add(ballMesh);
          ballBody = world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
              .setTranslation(...initialPosition)
              .setLinvel(0, 0, 0)
              .setAngvel({ x: 0, y: 0, z: 0 })
              .setAdditionalMass(BALL_MASS)
              .setLinearDamping(
                validationMode === 'part3' ? activePart3LinearDamping : 0.04,
              )
              .setAngularDamping(
                validationMode === 'part3' ? activePart3AngularDamping : 0.08,
              )
              .setCcdEnabled(true)
              .setSoftCcdPrediction(activeBallSoftCcdPrediction),
          );
          ballBody.enableCcd(true);
          ballBody.setSoftCcdPrediction(activeBallSoftCcdPrediction);
          ccdEnabled = true;
          const ballColliderDescriptor = RAPIER.ColliderDesc.ball(BALL_RADIUS)
              .setFriction(validationMode === 'part3' ? activePart3TrackFriction : 0.42)
              .setRestitution(validationMode === 'part3' ? 0.01 : 0.02)
              .setDensity(0.001);
           if (validationMode === 'part3' || validationMode === 'part4') {
            ballColliderDescriptor.setCollisionGroups(
              BALL_COLLISION_GROUP |
                ((STATIONARY_COLLISION_GROUP | ROTOR_COLLISION_GROUP) << 16),
            );
          }
          physicsBallCollider = world.createCollider(ballColliderDescriptor, ballBody);
          ballBody.setTranslation({ x: initialPosition[0], y: initialPosition[1], z: initialPosition[2] }, true);
          ballMesh.position.set(...initialPosition);
            if (
              part1ProbeOnly &&
              validationMode === 'part3' &&
              rotorBody &&
              ballBody &&
              physicsBallCollider
            ) {
              setPocketReport({
                status: 'running',
                results: [],
                detail:
                  'Running three PART 1 probes in the authoritative GLB world at 120 Hz with CCD…',
              });
              const report = runPocketEntryValidation(
                world,
                rotorBody,
                ballBody,
                physicsBallCollider,
                part3PocketColliders,
                normalizedAngle(rotorAngleRef.current),
                ballMesh,
                (x, z) => measureVisibleSurfaceAt(x, z, false),
                part3ColliderRoles,
                part3TrackCollider,
              );
              if (!disposed) setPocketReport(report);
            }
           if (validationMode === 'part3') {
              if (part1ProbeOnly) {
                callbacksRef.current.onStateChange(
                  'loaded',
                  'PART 1 authoritative-world probes complete',
                );
              } else if (geometryDiagnosticOnly) {
                try {
                  runPart3GeometryDiagnostic();
                } catch (error) {
                  console.error('PART C geometry diagnostic failed', error);
                  publishPart3GeometryDiagnosticReport({
                    status: 'failed',
                    trueDarkTrackInnerRadius: null,
                    trueDarkTrackOuterRadius: null,
                    trueDarkTrackCenterRadius: null,
                    darkTrackSurfaceYRange: null,
                    outerWoodRingRadiusBand: null,
                    nearestDeflectorRadiusBand:
                      part4MeasuredDeflectorInnerRadius !== null &&
                      part4MeasuredDeflectorOuterRadius !== null
                        ? [
                            Number(
                              part4MeasuredDeflectorInnerRadius.toFixed(4),
                            ),
                            Number(
                              part4MeasuredDeflectorOuterRadius.toFixed(4),
                            ),
                          ]
                        : null,
                    visibleDeflectorCount:
                      part4DeflectorAudit?.descriptors.length ?? null,
                    visibleDeflectorAnglesDegrees:
                      part4DeflectorAudit?.descriptors.map(
                        (descriptor) =>
                          Number(
                            THREE.MathUtils.radToDeg(
                              descriptor.angle,
                            ).toFixed(3),
                          ),
                      ) ?? [],
                    visibleDeflectorAuditPassed:
                      part4DeflectorAudit?.passed ?? false,
                    proposedLaunchRadius: null,
                    proposedLaunchHeight: null,
                    ballRadius: BALL_RADIUS,
                    rimClearance: null,
                    deflectorClearance: null,
                    staticVisibleContact: false,
                    staticOnDarkTrack: false,
                    staticOnWood: false,
                    staticInsideWheel: false,
                    staticHover: false,
                    radialProfile: [],
                    detail: `PART C geometry diagnostic error: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
                  });
                }
                callbacksRef.current.onStateChange(
                  'loaded',
                  'PART C diagnostic radial geometry profile running',
                );
              } else if (part6FullSpinRouteActive) {
                 runPart2RaceStaticPlacementCheck();
                 callbacksRef.current.onStateChange(
                   'loaded',
                   'PART 6B full-spin route active · recessed dark-race static gate running',
                 );
              } else if (outerLaneOnly) {
                startPart3OuterLaneProbe();
               callbacksRef.current.onStateChange(
                 'loaded',
                 'PART B short outer dark-track launch-lane probe running',
               );
             } else if (alignmentOnly) {
               startPart3AlignmentProbe();
               callbacksRef.current.onStateChange(
                 'loaded',
                 'PART 3 short visual/physics alignment probe running',
               );
             } else {
               startPart3Probe(0);
               callbacksRef.current.onStateChange('loaded', 'PART 3 static-collider ball probes running');
             }
          } else if (validationMode === 'part4') {
            startPart4Probe(0);
            callbacksRef.current.onStateChange('loaded', 'PART 4 kinematic-rotor probes running');
          } else {
            publishDropReport({
              status: 'running',
              initialPosition: roundedVector(new THREE.Vector3(...initialPosition)),
              firstContactPosition: null,
              firstContactRadius: null,
              firstContactTime: null,
              finalPosition: roundedVector(new THREE.Vector3(...initialPosition)),
              finalSpeed: 0,
              maxPenetration: 0,
              finalSeparation: DROP_HEIGHT_ABOVE_SURFACE,
              passThrough: false,
              visibleSurfaceMatch: false,
              ccdEnabled,
              maxVisualBodySyncError: 0,
              colliderProfile: COLLIDER_PROFILE,
              detail: 'One zero-horizontal-velocity drop running at 120 Hz.',
            });
            dropStarted = true;
            callbacksRef.current.onStateChange('loaded', 'PART 2 collider shell ready · one zero-velocity drop running');
          }
        },
        undefined,
        (error) => {
          if (disposed) return;
          console.error('PART 2 roulette visual source failed to load', error);
          callbacksRef.current.onStateChange(
            'error',
            'The rou_LP_Test_04 visual source could not be read.',
            'asset',
          );
        },
      );

      const resize = () => {
        const container = stage.parentElement ?? stage;
        const width = Math.max(container.clientWidth, 1);
        const height = Math.max(container.clientHeight, 1);
        renderer?.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        const target = controls?.target ?? new THREE.Vector3(0, 0, 0);
        const cameraOffset = camera.position.clone().sub(target);
        const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
        const horizontalHalfFov = Math.atan(
          Math.tan(verticalHalfFov) * camera.aspect,
        );
        const wheelRadiusWithMargin = (ROULETTE_NORMALIZED_DIAMETER / 2) * 1.08;
        const requiredDistance = wheelRadiusWithMargin / Math.min(
          Math.tan(verticalHalfFov),
          Math.tan(horizontalHalfFov),
        );
        if (cameraOffset.length() < requiredDistance) {
          camera.position.copy(
            target.clone().add(cameraOffset.setLength(requiredDistance)),
          );
          controls?.update();
        }
      };
      const observer = new ResizeObserver(resize);
      observer.observe(stage.parentElement ?? stage);
      resize();
      const resetView = () => applyView(viewRef.current);
      window.addEventListener('roulette-reset-view', resetView);

      const completePart3Probe = (position: RAPIER.Vector, velocity: RAPIER.Vector) => {
        const probe = PART3_PROBES[part3ProbeIndex];
        const finalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
        const isDeflectorApproach = probe.kind === 'deflector-approach';
        const trackContactRatio =
          part3TrackSampleFrames > 0
            ? part3TrackContactFrames / part3TrackSampleFrames
            : 0;
        const continuousTrackContact = trackContactRatio >= 0.94;
        const stableContact =
          part3SampleFrames > 0 && part3ContactFrames / part3SampleFrames >= 0.75;
        const leftValidVolume =
          part3LeftValidVolume ||
          !Number.isFinite(position.x) ||
          !Number.isFinite(position.y) ||
          !Number.isFinite(position.z);
        const tunneling = leftValidVolume || part3MaxPenetration > 0.08;
        const velocityExplosion =
          part3PeakSpeed > Math.max(8, probe.speed * 4);
        const lapCount =
          part3TrackAngleStart === null || part3TrackAngleEnd === null
            ? 0
            : Math.abs(part3TrackAngleEnd - part3TrackAngleStart) / TWO_PI;
        const trackDuration =
          part3TrackAngleStart === null || part3TrackAngleEnd === null
            ? 0
            : Math.max(
                0,
                part3InwardDescentTime === null
                  ? part3Elapsed
                  : part3InwardDescentTime,
              );
        const averageTrackSpeed =
          part3TrackContactFrames > 0
            ? part3TrackSpeedSum / part3TrackContactFrames
            : 0;
        const energyLossRatio =
          part3TrackStartSpeed > 0
            ? Math.max(
                0,
                1 -
                  (part3TrackEndSpeed * part3TrackEndSpeed) /
                    (part3TrackStartSpeed * part3TrackStartSpeed),
              )
            : 0;
        const naturalRollOrSlide =
          part3TrackContactFrames > 120 &&
          part3TrackStartSpeed > part3TrackEndSpeed;
        const impactDirectionChangeDegrees =
          part3ImpactDirectionBefore && part3ImpactDirectionAfter
            ? THREE.MathUtils.radToDeg(
                part3ImpactDirectionBefore.angleTo(part3ImpactDirectionAfter),
              )
            : null;
        const noPassThrough = !part3DeflectorPassThrough;
        const visualContactAlignmentCredible =
          Boolean(part4DeflectorAudit?.passed) &&
          part3DeflectorColliders.length ===
            (part4DeflectorAudit?.descriptors.length ?? -1);
        const passed =
          isDeflectorApproach
            ? part3DeflectorContact &&
              part3ImpactSpeedBefore !== null &&
              part3ImpactSpeedAfter !== null &&
              (impactDirectionChangeDegrees ?? 0) >= 10 &&
              noPassThrough &&
              !velocityExplosion &&
              !leftValidVolume &&
              !tunneling &&
              part3MaxVisualBodySyncError <= 0.001 &&
              visualContactAlignmentCredible
            : lapCount >= 2.5 &&
              lapCount <= 8 &&
              continuousTrackContact &&
              naturalRollOrSlide &&
              (part3EarlyLapMinimumDeflectorClearance ?? 0) >= 0.005 &&
              !part3ArtificialAcceleration &&
              !part3Hover &&
              !part3Clipping &&
              stableContact &&
              !leftValidVolume &&
              !tunneling &&
              !velocityExplosion &&
              part3MaxVisualBodySyncError <= 0.001;
        const result: Part3ProbeResult = {
          id: probe.id,
          label: probe.label,
          spawnRadius: probe.radius,
           spawnHeight: Number(part3SpawnPosition(probe, part3TrackVerticalOffset)[1].toFixed(4)),
          initialVelocity: part3InitialVelocity(probe),
          initialAngularSpin: part3InitialAngularSpin(probe),
          lapCount: Number(lapCount.toFixed(3)),
          trackDuration: Number(trackDuration.toFixed(4)),
          averageTrackSpeed: Number(averageTrackSpeed.toFixed(4)),
          trackStartSpeed: Number(part3TrackStartSpeed.toFixed(4)),
          trackEndSpeed: Number(part3TrackEndSpeed.toFixed(4)),
          trackLapSpeeds: part3TrackLapSpeeds.map((speed) =>
            Number(speed.toFixed(4)),
          ),
          energyLossRatio: Number(energyLossRatio.toFixed(4)),
          continuousTrackContact,
          naturalRollOrSlide,
          inwardDescentTime:
            part3InwardDescentTime === null
              ? null
              : Number(part3InwardDescentTime.toFixed(4)),
          inwardDescentRadius:
            part3InwardDescentRadius === null
              ? null
              : Number(part3InwardDescentRadius.toFixed(4)),
          deflectorContact: part3DeflectorContact,
          peakSpeedBeforeContact:
            part3ImpactSpeedBefore === null
              ? null
              : Number(part3ImpactSpeedBefore.toFixed(4)),
          peakSpeedAfterContact:
            part3ImpactSpeedAfter === null
              ? null
              : Number(part3ImpactSpeedAfter.toFixed(4)),
          impactSpeedBefore:
            part3ImpactSpeedBefore === null
              ? null
              : Number(part3ImpactSpeedBefore.toFixed(4)),
          impactSpeedAfter:
            part3ImpactSpeedAfter === null
              ? null
              : Number(part3ImpactSpeedAfter.toFixed(4)),
          impactDirectionChangeDegrees:
            impactDirectionChangeDegrees === null
              ? null
              : Number(impactDirectionChangeDegrees.toFixed(2)),
          noPassThrough,
          visualContactAlignmentCredible,
          retainingRimRadius: PART3_RETAINING_RIM_INNER_RADIUS,
          nearestDeflectorRadius:
            isDeflectorApproach
              ? part4MeasuredDeflectorInnerRadius ??
                PART2_ACTUAL_INWARD_EDGE_RADIUS
              : part4MeasuredDeflectorOuterRadius ??
                PART2_ACTUAL_INWARD_EDGE_RADIUS,
          earlyLapMinimumDeflectorClearance:
            part3EarlyLapMinimumDeflectorClearance === null
              ? null
              : Number(part3EarlyLapMinimumDeflectorClearance.toFixed(4)),
          deflectorColliderCount: part3DeflectorColliders.length,
          deflectorColliderType: 'asset-measured-cuboid',
          deflectorColliderFriction: PART3_DEFLECTOR_FRICTION,
          deflectorColliderRestitution: PART3_DEFLECTOR_RESTITUTION,
          bouncePlausible: part3BouncePlausible,
          hover: part3Hover,
          clipping: part3Clipping,
          artificialAcceleration: part3ArtificialAcceleration,
          maxRotorSyncError: 0,
          peakSpeed: Number(part3PeakSpeed.toFixed(4)),
          minRadius: Number(part3MinRadius.toFixed(4)),
          maxRadius: Number(part3MaxRadius.toFixed(4)),
          maxPenetration: Number(part3MaxPenetration.toFixed(4)),
          maxSeparation: Number(part3MaxSeparation.toFixed(4)),
          stableContact,
          leftValidVolume,
          tunneling,
          velocityExplosion,
          maxVisualBodySyncError: Number(part3MaxVisualBodySyncError.toFixed(6)),
          outcome: passed ? (finalSpeed < 0.08 ? 'settled' : 'stable') : 'failed',
          detail: passed
            ? isDeflectorApproach
              ? `Deflector impact passed: ${part3ImpactSpeedBefore?.toFixed(3)}→${part3ImpactSpeedAfter?.toFixed(3)} m/s with ${impactDirectionChangeDegrees?.toFixed(1)}° direction change.`
              : `Outer-track launch passed: ${lapCount.toFixed(2)} laps with ${part3EarlyLapMinimumDeflectorClearance?.toFixed(3)} m positive clearance before any inward approach.`
            : `Outer-track smoke failed: ${[
                isDeflectorApproach
                  ? !part3DeflectorContact
                    ? 'no deflector contact'
                    : ''
                  : lapCount < 2.5 || lapCount > 8
                    ? 'lap target'
                    : '',
                isDeflectorApproach
                  ? part3ImpactSpeedAfter === null
                    ? 'no impact aftermath'
                    : ''
                  : !continuousTrackContact
                    ? 'contact continuity'
                    : '',
                isDeflectorApproach
                  ? (impactDirectionChangeDegrees ?? 0) < 10
                    ? 'no direction change'
                    : ''
                  : '',
                !noPassThrough ? 'pass-through' : '',
                part3ArtificialAcceleration ? 'artificial acceleration' : '',
                part3Hover ? 'hover' : '',
                part3Clipping ? 'clipping' : '',
                leftValidVolume ? 'escape' : '',
                tunneling ? 'tunneling' : '',
                velocityExplosion ? 'velocity spike' : '',
              ]
                .filter(Boolean)
                .join(', ') || 'review required'}.`,
        };
        part3Results = [...part3Results, result];
        if (part3ProbeIndex === PART3_PROBES.length - 1) {
          part3Finished = true;
          startPart3PocketProbe();
        } else {
          startPart3Probe(part3ProbeIndex + 1);
        }
      };

      const completePart4Probe = (position: RAPIER.Vector, velocity: RAPIER.Vector) => {
        const probe = PART4_PROBES[part4ProbeIndex];
        const finalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
        const stableContact =
          part4SampleFrames > 0 && part4ContactFrames / part4SampleFrames >= 0.75;
        const velocityExplosion =
          part4PeakSpeed > Math.max(8, part4InitialSpeed * 4);
        const passed =
          stableContact &&
          !part4LeftValidVolume &&
          part4MaxPenetration <= 0.08 &&
          !velocityExplosion &&
          part4MaxVisualBodySyncError <= 0.001 &&
          part4MaxRotorSyncError <= 0.001 &&
          part4OutsideTurretStationary;
        const result: Part4ProbeResult = {
          id: probe.id,
          label: probe.label,
          rotorAngularSpeed: TEST_ANGULAR_SPEED,
          contactDuration: Number((part4ContactFrames * FIXED_TIMESTEP).toFixed(4)),
          spawnRadius: probe.radius,
          spawnHeight: Number(part4SpawnPosition(probe)[1].toFixed(4)),
          initialVelocity: part4InitialVelocity(probe),
          peakSpeed: Number(part4PeakSpeed.toFixed(4)),
          maxEnergyGain: Number(part4MaxEnergyGain.toFixed(4)),
          minRadius: Number(part4MinRadius.toFixed(4)),
          maxRadius: Number(part4MaxRadius.toFixed(4)),
          maxPenetration: Number(part4MaxPenetration.toFixed(4)),
          maxSeparation: Number(part4MaxSeparation.toFixed(4)),
          escaped: part4LeftValidVolume,
          tunneling: part4LeftValidVolume || part4MaxPenetration > 0.08,
          velocityExplosion,
          maxVisualBodySyncError: Number(part4MaxVisualBodySyncError.toFixed(6)),
          maxRotorSyncError: Number(part4MaxRotorSyncError.toFixed(6)),
          outsideTurretStationary: part4OutsideTurretStationary,
          outcome: passed ? (finalSpeed < 0.08 ? 'settled' : 'stable') : 'failed',
          detail: passed
            ? finalSpeed < 0.08
              ? 'Moving rotor contact remained stable and the ball settled.'
              : 'Moving rotor contact remained stable without artificial launch.'
            : 'Probe failed the kinematic-rotor contact envelope.',
        };
        part4Results = [...part4Results, result];
        if (!passed || part4ProbeIndex === PART4_PROBES.length - 1) {
          part4Finished = true;
          publishPart4Report(
            part4Results.every((probeResult) => probeResult.outcome !== 'failed')
              ? 'passed'
              : 'failed',
            part4Results.every((probeResult) => probeResult.outcome !== 'failed')
              ? 'Both deterministic kinematic-rotor probes passed.'
              : 'A deterministic kinematic-rotor probe failed.',
          );
        } else {
          startPart4Probe(part4ProbeIndex + 1);
        }
      };

      const render = () => {
        if (disposed) return;
        const now = performance.now();
        accumulator += Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        while (accumulator >= FIXED_TIMESTEP) {
          if (rotorPivot && !part6TelemetryBatchRunning) {
            rotorAngleRef.current = normalizedAngle(rotorAngleRef.current + TEST_ANGULAR_SPEED * FIXED_TIMESTEP);
            rotorPivot.rotation.set(0, rotorAngleRef.current, 0);
            if (
              (validationMode === 'part3' || validationMode === 'part4') &&
              rotorBody
            ) {
              rotorBody.setNextKinematicRotation({
                x: 0,
                y: Math.sin(rotorAngleRef.current / 2),
                z: 0,
                w: Math.cos(rotorAngleRef.current / 2),
              });
            }
            fixedStepCount += 1;
            if (fixedStepCount % 6 === 0) {
              setAngleReadout(rotorAngleRef.current);
              callbacksRef.current.onRotorAngleChange(rotorAngleRef.current);
            }
          }

          if (
            validationMode === 'part3' &&
            outerLaneOnly &&
            !part6FullSpinRouteActive &&
            world &&
            ballBody &&
            ballMesh &&
            part3OuterLaneRunning
          ) {
            world.step();
            const position = ballBody.translation();
            const velocity = ballBody.linvel();
            const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
            const radius = Math.hypot(position.x, position.z);
            const contactY = part2ChannelSurfaceAt(
              radius,
              part2RaceVerticalOffset,
            ).y;
            const bottom = position.y - BALL_RADIUS;
            const penetration = Math.max(0, contactY - bottom);
            const separation = Math.max(0, bottom - contactY);
            let trackPairContact = false;
            let deflectorPairContact = false;
            if (physicsBallCollider) {
              world.contactPairsWith(physicsBallCollider, (otherCollider) => {
                if (otherCollider.handle === part3TrackCollider?.handle) {
                  trackPairContact = true;
                }
                if (
                  part3DeflectorColliders.some(
                    (deflectorCollider) => deflectorCollider.handle === otherCollider.handle,
                  )
                ) {
                  deflectorPairContact = true;
                }
              });
            }
            const ballCenterInsideOuterLane =
              radius >=
                PART2_INNER_CONTAINMENT_CENTER_LIMIT &&
              radius <=
                PART2_CHANNEL_PROFILE[PART2_CHANNEL_OUTER_WALL_FOOT_INDEX][0] -
                  BALL_RADIUS;
            const geometricTrackContact =
              ballCenterInsideOuterLane &&
              penetration <= 0.03 &&
              separation <= 0.03;
            const rimClearance =
              PART2_ACTUAL_WOOD_INNER_RADIUS - BALL_RADIUS - radius;
            const deflectorClearance =
              radius -
              BALL_RADIUS -
              (part4MeasuredDeflectorOuterRadius ??
                PART2_ACTUAL_INWARD_EDGE_RADIUS);
            const woodContact =
              radius + BALL_RADIUS >= PART2_ACTUAL_WOOD_INNER_RADIUS - 0.005;
            const escaped =
              !Number.isFinite(position.x) ||
              !Number.isFinite(position.y) ||
              !Number.isFinite(position.z) ||
              radius < PART2_CHANNEL_PROFILE[0][0] - BALL_RADIUS ||
              radius >
                PART2_CHANNEL_PROFILE.at(-1)![0] + BALL_RADIUS ||
              position.y < COLLIDER_PROFILE.innerFloorTop - BALL_RADIUS - 0.08;
            part3OuterLaneElapsed += FIXED_TIMESTEP;
            part3OuterLaneSampleFrames += 1;
            part3OuterLaneTrackContactFrames += trackPairContact ? 1 : 0;
            part3OuterLaneMinRadius = Math.min(part3OuterLaneMinRadius, radius);
            part3OuterLaneMaxRadius = Math.max(part3OuterLaneMaxRadius, radius);
            part3OuterLaneMinRimClearance = Math.min(
              part3OuterLaneMinRimClearance,
              rimClearance,
            );
            part3OuterLaneMinDeflectorClearance = Math.min(
              part3OuterLaneMinDeflectorClearance,
              deflectorClearance,
            );
            part3OuterLaneMaxPenetration = Math.max(
              part3OuterLaneMaxPenetration,
              penetration,
            );
            part3OuterLaneMaxSeparation = Math.max(
              part3OuterLaneMaxSeparation,
              separation,
            );
            part3OuterLanePeakSpeed = Math.max(
              part3OuterLanePeakSpeed,
              speed,
            );
            const measuredPrematureDeflectorContact =
              deflectorPairContact &&
              deflectorClearance < PART3_OUTER_LANE_CLEARANCE_MARGIN;
            part3OuterLaneDeflectorContact ||= measuredPrematureDeflectorContact;
            part3OuterLaneWoodContact ||= woodContact;
            part3OuterLaneHover ||= geometricTrackContact && !trackPairContact;
            part3OuterLaneClipping ||= penetration > 0.03;
            part3OuterLaneEscaped ||= escaped;
            part3OuterLaneTunneling ||= escaped || penetration > 0.08;
            part3OuterLaneVelocitySpike ||=
              speed > Math.max(8, part3OuterLaneInitialLinearSpeed * 4);
            ballMesh.position.set(position.x, position.y, position.z);
            const rotation = ballBody.rotation();
            ballMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            part3OuterLaneMaxVisualBodySyncError = Math.max(
              part3OuterLaneMaxVisualBodySyncError,
              Math.hypot(
                ballMesh.position.x - position.x,
                ballMesh.position.y - position.y,
                ballMesh.position.z - position.z,
              ),
            );
            if (part3OuterLaneElapsed >= PART3_OUTER_LANE_PROBE_DURATION_SECONDS) {
              const physicalTrackContact =
                part3OuterLaneSampleFrames > 0 &&
                part3OuterLaneTrackContactFrames / part3OuterLaneSampleFrames >= 0.9;
              const staysOnOuterDarkLane =
                part3OuterLaneSampleFrames > 0 &&
                !part3OuterLaneEscaped &&
                !part3OuterLaneDeflectorContact &&
                !part3OuterLaneHover &&
                 part3OuterLaneMinRadius >=
                   PART2_INNER_CONTAINMENT_CENTER_LIMIT &&
                 part3OuterLaneMaxRadius <=
                   PART2_CHANNEL_PROFILE[PART2_CHANNEL_OUTER_WALL_FOOT_INDEX][0] -
                     BALL_RADIUS &&
                part3OuterLaneMinRimClearance >= PART3_OUTER_LANE_CLEARANCE_MARGIN &&
                part3OuterLaneMinDeflectorClearance >=
                  PART3_OUTER_LANE_CLEARANCE_MARGIN;
              const passed =
                staysOnOuterDarkLane &&
                physicalTrackContact &&
                part3OuterLaneMinRimClearance >= PART3_OUTER_LANE_CLEARANCE_MARGIN &&
                part3OuterLaneMinDeflectorClearance >= PART3_OUTER_LANE_CLEARANCE_MARGIN &&
                !part3OuterLaneWoodContact &&
                !part3OuterLaneClipping &&
                !part3OuterLaneTunneling &&
                !part3OuterLaneVelocitySpike &&
                part3OuterLaneMaxVisualBodySyncError <= 0.000001;
              part3OuterLaneRunning = false;
              publishPart3OuterLaneReport({
                status: passed ? 'passed' : 'failed',
                darkTrackInnerRadius:
                  PART2_ACTUAL_DARK_TRACK_RADIUS_BAND[0],
                darkTrackOuterRadius:
                  PART2_ACTUAL_DARK_TRACK_RADIUS_BAND[1],
                retainingRimInnerRadius: PART2_ACTUAL_WOOD_INNER_RADIUS,
                nearestDeflectorOuterRadius:
                  part4MeasuredDeflectorOuterRadius ??
                  PART2_ACTUAL_INWARD_EDGE_RADIUS,
                ballRadius: BALL_RADIUS,
                chosenLaunchRadius: part3OuterLaneLaunchRadius,
                radialClearanceToRim:
                  PART2_ACTUAL_WOOD_INNER_RADIUS -
                  BALL_RADIUS -
                  part3OuterLaneLaunchRadius,
                radialClearanceToDeflector:
                  part3OuterLaneLaunchRadius -
                  BALL_RADIUS -
                  (part4MeasuredDeflectorOuterRadius ??
                    PART2_ACTUAL_INWARD_EDGE_RADIUS),
                outerTrackEdgeClearance:
                  PART2_ACTUAL_DARK_TRACK_RADIUS_BAND[1] -
                  BALL_RADIUS -
                  part3OuterLaneLaunchRadius,
                launchAzimuth: part3OuterLaneLaunchAzimuth,
                launchHeight: part3OuterLaneLaunchHeight,
                tangentialLaunchDirection: {
                  x: Number(
                    (
                      part3OuterLaneInitialVelocity.x /
                      Math.max(part3OuterLaneInitialLinearSpeed, 0.0001)
                    ).toFixed(4),
                  ),
                  y: 0,
                  z: Number(
                    (
                      part3OuterLaneInitialVelocity.z /
                      Math.max(part3OuterLaneInitialLinearSpeed, 0.0001)
                    ).toFixed(4),
                  ),
                },
                initialLinearSpeed: part3OuterLaneInitialLinearSpeed,
                initialAngularSpin: part3OuterLaneInitialAngularSpin,
                floorContactNormal: roundedVector(
                  part2ChannelNormalAt(
                    THREE.MathUtils.clamp(
                      part3OuterLaneMinRadius,
                      PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_INNER_INDEX][0],
                      PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_OUTER_INDEX][0],
                    ),
                    part3OuterLaneLaunchAzimuth,
                  ),
                ),
                outerWallContactNormal: roundedVector(
                  new THREE.Vector3(
                    -Math.sin(part3OuterLaneLaunchAzimuth),
                    0,
                    -Math.cos(part3OuterLaneLaunchAzimuth),
                  ),
                ),
                peakSpeed: part3OuterLanePeakSpeed,
                inwardRadialDrift: Math.max(
                  0,
                  part3OuterLaneInitialRadius - part3OuterLaneMinRadius,
                ),
                minRadius: part3OuterLaneMinRadius,
                maxRadius: part3OuterLaneMaxRadius,
                minRimClearance: part3OuterLaneMinRimClearance,
                minDeflectorClearance: part3OuterLaneMinDeflectorClearance,
                innerContainmentRadius: PART2_INNER_CONTAINMENT_RADIUS,
                innerContainmentCenterLimit:
                  PART2_INNER_CONTAINMENT_CENTER_LIMIT,
                minimumInnerContainmentClearance:
                  part3OuterLaneMinRadius -
                  PART2_INNER_CONTAINMENT_CENTER_LIMIT,
                staysOnOuterDarkLane,
                prematureDeflectorContact: part3OuterLaneDeflectorContact,
                woodContact: part3OuterLaneWoodContact,
                hover: part3OuterLaneHover,
                clipping: part3OuterLaneClipping,
                tunneling: part3OuterLaneTunneling,
                escaped: part3OuterLaneEscaped,
                velocitySpike: part3OuterLaneVelocitySpike,
                maxVisualBodySyncError: part3OuterLaneMaxVisualBodySyncError,
                maxPenetration: part3OuterLaneMaxPenetration,
                maxSeparation: part3OuterLaneMaxSeparation,
                physicalTrackContact,
                detail: passed
                  ? 'PASS: the ball stayed on the measured outer dark lane during the short high-speed probe with safe rim/deflector clearance.'
                  : 'FAIL: the short outer-lane probe violated its contact, clearance, or stability envelope.',
              });
              callbacksRef.current.onStateChange(
                passed ? 'loaded' : 'error',
                passed
                  ? 'PART B outer dark-track launch lane passed'
                  : 'PART B outer dark-track launch lane failed',
                passed ? undefined : 'physics-validation',
              );
              setPart2RacePlacementReport((previous) =>
                previous
                  ? {
                      ...previous,
                      status:
                        passed && previous.visualGateVerified
                          ? 'passed'
                          : 'failed',
                      detail: passed
                        ? previous.visualGateVerified
                          ? 'PASS: static placement and the short tangential probe stayed physically and visibly inside the measured recessed dark race.'
                          : 'FAIL: the numerical short probe passed, but the visual WebGL gate was not verified.'
                        : `FAIL: static placement passed, but the short tangential probe failed (${[
                            !staysOnOuterDarkLane
                              ? 'inner/outer channel envelope'
                              : '',
                            !physicalTrackContact
                              ? 'contact continuity'
                              : '',
                            part3OuterLaneMinDeflectorClearance <
                            PART3_OUTER_LANE_CLEARANCE_MARGIN
                              ? 'inner clearance'
                              : '',
                            part3OuterLaneMinRimClearance <
                            PART3_OUTER_LANE_CLEARANCE_MARGIN
                              ? 'outer/rim clearance'
                              : '',
                            part3OuterLaneEscaped ? 'escape' : '',
                          ]
                            .filter(Boolean)
                            .join(', ') || 'stability envelope'}).`,
                    }
                  : previous,
              );
            }
          }

          if (
            validationMode === 'part3' &&
            outerLaneSpinOnly &&
            !part6FullSpinRouteActive &&
            world &&
            ballBody &&
            ballMesh &&
            part3OuterLaneSpinRunning
          ) {
            world.step();
            const position = ballBody.translation();
            const velocity = ballBody.linvel();
            const angularVelocity = ballBody.angvel();
            const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
            const radius = Math.hypot(position.x, position.z);
            const inTrackCenterBand =
              radius >= PART2_ACTUAL_TRACK_CENTER_RADIUS_BAND[0] &&
              radius <= PART2_ACTUAL_TRACK_CENTER_RADIUS_BAND[1];
            const surface =
              radius >= PART2_ACTUAL_INWARD_EDGE_RADIUS - 0.08 &&
              radius <= PART2_ACTUAL_WOOD_INNER_RADIUS + 0.08
                ? measureVisibleSurfaceAt(position.x, position.z, false)
                : null;
            let signedSurfaceGap = Number.POSITIVE_INFINITY;
            if (surface) {
              const offsetFromSurface = new THREE.Vector3(
                position.x - surface.point.x,
                position.y - surface.point.y,
                position.z - surface.point.z,
              );
              const surfaceNormal = new THREE.Vector3(
                surface.normal.x,
                surface.normal.y,
                surface.normal.z,
              );
              signedSurfaceGap =
                offsetFromSurface.dot(surfaceNormal) - BALL_RADIUS;
            }
            const penetration =
              Number.isFinite(signedSurfaceGap) && signedSurfaceGap < 0
                ? -signedSurfaceGap
                : 0;
            const separation =
              Number.isFinite(signedSurfaceGap) && signedSurfaceGap > 0
                ? signedSurfaceGap
                : 0;
            let trackPairContact = false;
            if (physicsBallCollider && part3TrackCollider) {
              world.contactPairsWith(physicsBallCollider, (otherCollider) => {
                if (otherCollider.handle === part3TrackCollider?.handle) {
                  trackPairContact = true;
                }
              });
            }
            const geometricTrackContact =
              inTrackCenterBand &&
              Number.isFinite(signedSurfaceGap) &&
              penetration <= 0.03 &&
              separation <= 0.03;
            const trackAngle = normalizedAngle(Math.atan2(position.x, position.z));
            const rotorRotation = rotorBody?.rotation();
            const rotorBodyAngle = rotorRotation
              ? normalizedAngle(2 * Math.atan2(rotorRotation.y, rotorRotation.w))
              : rotorAngleRef.current;
            const rotorSyncError = Math.abs(
              THREE.MathUtils.euclideanModulo(
                rotorBodyAngle - rotorAngleRef.current + Math.PI,
                TWO_PI,
              ) - Math.PI,
            );
            const rimClearance =
              PART2_ACTUAL_WOOD_INNER_RADIUS - BALL_RADIUS - radius;
            const inwardClearance =
              radius -
              BALL_RADIUS -
              (part4MeasuredDeflectorOuterRadius ??
                PART2_ACTUAL_INWARD_EDGE_RADIUS);
            const woodContact =
              radius + BALL_RADIUS >= PART2_ACTUAL_WOOD_INNER_RADIUS - 0.005;
            const escaped =
              !Number.isFinite(position.x) ||
              !Number.isFinite(position.y) ||
              !Number.isFinite(position.z) ||
              radius < 1.72 ||
              radius > 3.08 ||
              position.y < COLLIDER_PROFILE.innerFloorTop - BALL_RADIUS - 0.08;

            part3OuterLaneSpinElapsed += FIXED_TIMESTEP;
            part3OuterLaneSpinTrackFrames += inTrackCenterBand ? 1 : 0;
            part3OuterLaneSpinContactFrames +=
              inTrackCenterBand && trackPairContact ? 1 : 0;
            part3OuterLaneSpinMinRadius = Math.min(
              part3OuterLaneSpinMinRadius,
              radius,
            );
            part3OuterLaneSpinMaxRadius = Math.max(
              part3OuterLaneSpinMaxRadius,
              radius,
            );
            part3OuterLaneSpinMinRimClearance = Math.min(
              part3OuterLaneSpinMinRimClearance,
              rimClearance,
            );
            part3OuterLaneSpinMinDeflectorClearance = Math.min(
              part3OuterLaneSpinMinDeflectorClearance,
              inwardClearance,
            );
            part3OuterLaneSpinMaxPenetration = Math.max(
              part3OuterLaneSpinMaxPenetration,
              penetration,
            );
            part3OuterLaneSpinMaxSeparation = Math.max(
              part3OuterLaneSpinMaxSeparation,
              separation,
            );
            part3OuterLaneSpinPeakSpeed = Math.max(
              part3OuterLaneSpinPeakSpeed,
              speed,
            );
            part3OuterLaneSpinWoodContact ||= woodContact;
            part3OuterLaneSpinHover ||=
              geometricTrackContact && !trackPairContact;
            part3OuterLaneSpinClipping ||= penetration > 0.03;
            part3OuterLaneSpinEscaped ||= escaped;
            part3OuterLaneSpinTunneling ||= escaped || penetration > 0.08;
            part3OuterLaneSpinVelocitySpike ||=
              speed > Math.max(8, part3OuterLaneSpinPreviousSpeed * 4);
            part3OuterLaneSpinArtificialAcceleration ||=
              speed > Math.max(
                12,
                part3OuterLaneSpinPreviousSpeed > 0
                  ? part3OuterLaneSpinPreviousSpeed * 3
                  : 12,
              );
            part3OuterLaneSpinMaxRotorSyncError = Math.max(
              part3OuterLaneSpinMaxRotorSyncError,
              rotorSyncError,
            );

            if (inTrackCenterBand && trackPairContact) {
              if (part3OuterLaneSpinTrackAngle === null) {
                part3OuterLaneSpinTrackAngle = trackAngle;
                part3OuterLaneSpinTrackAngleStart = trackAngle;
                part3OuterLaneSpinStartSpeed = speed;
              } else {
                const delta = THREE.MathUtils.euclideanModulo(
                  trackAngle -
                    normalizedAngle(part3OuterLaneSpinTrackAngle) +
                    Math.PI,
                  TWO_PI,
                ) - Math.PI;
                part3OuterLaneSpinTrackAngle += delta;
                part3OuterLaneSpinTrackAngleEnd =
                  part3OuterLaneSpinTrackAngle;
                const completedLaps = Math.floor(
                  Math.abs(
                    part3OuterLaneSpinTrackAngle -
                      part3OuterLaneSpinTrackAngleStart!,
                  ) / TWO_PI,
                );
                if (completedLaps > part3OuterLaneSpinCompletedLaps) {
                  part3OuterLaneSpinCompletedLaps = completedLaps;
                  part3OuterLaneSpinLapSpeeds.push(speed);
                }
              }
              part3OuterLaneSpinTrackFrames += 0;
              part3OuterLaneSpinSpeedSum += speed;
              part3OuterLaneSpinEndSpeed = speed;
              const rollingSpeed =
                Math.hypot(
                  angularVelocity.x,
                  angularVelocity.y,
                  angularVelocity.z,
                ) * BALL_RADIUS;
              part3OuterLaneSpinRollingMismatchSum +=
                Math.abs(rollingSpeed - speed) / Math.max(speed, 0.1);
              part3OuterLaneSpinRollingSamples += 1;
            } else if (
              part3OuterLaneSpinInwardTransitionTime === null &&
              part3OuterLaneSpinTrackAngleStart !== null &&
              radius < PART2_ACTUAL_TRACK_CENTER_RADIUS_BAND[0]
            ) {
              part3OuterLaneSpinInwardTransitionTime =
                part3OuterLaneSpinElapsed;
              part3OuterLaneSpinInwardTransitionRadius = radius;
              part3OuterLaneSpinTrackAngleEnd ??=
                part3OuterLaneSpinTrackAngle;
            }

            ballMesh.position.set(position.x, position.y, position.z);
            const rotation = ballBody.rotation();
            ballMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            part3OuterLaneSpinMaxVisualBodySyncError = Math.max(
              part3OuterLaneSpinMaxVisualBodySyncError,
              Math.hypot(
                ballMesh.position.x - position.x,
                ballMesh.position.y - position.y,
                ballMesh.position.z - position.z,
              ),
            );
            part3OuterLaneSpinPreviousSpeed = speed;

            if (
              part3OuterLaneSpinElapsed >=
              PART3_OUTER_SPIN_DURATION_SECONDS
            ) {
              completePart3OuterLaneSpin(position, velocity);
            }
          }

          if (
            validationMode === 'part3' &&
            alignmentOnly &&
            world &&
            ballBody &&
            ballMesh &&
            part3AlignmentRunning
          ) {
            world.step();
            const position = ballBody.translation();
            const velocity = ballBody.linvel();
            const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
            const radius = Math.hypot(position.x, position.z);
            const visibleSurface = measureVisibleSurfaceAt(position.x, position.z);
            const analyticContactY = part3TrackHeight(radius, part3TrackVerticalOffset);
            const bottom = position.y - BALL_RADIUS;
            const signedVerticalMismatch =
              visibleSurface === null ? null : bottom - visibleSurface.y;
            const signedColliderContactMismatch = bottom - analyticContactY;
            let trackPairContact = false;
            if (physicsBallCollider && part3TrackCollider) {
              world.contactPairsWith(physicsBallCollider, (otherCollider) => {
                if (otherCollider.handle === part3TrackCollider?.handle) {
                  trackPairContact = true;
                }
              });
            }
            ballMesh.position.set(position.x, position.y, position.z);
            const rotation = ballBody.rotation();
            ballMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            part3AlignmentMaxVisualBodySyncError = Math.max(
              part3AlignmentMaxVisualBodySyncError,
              Math.hypot(
                ballMesh.position.x - position.x,
                ballMesh.position.y - position.y,
                ballMesh.position.z - position.z,
              ),
            );
            part3Elapsed += FIXED_TIMESTEP;
            if (part3Elapsed >= PART3_ALIGNMENT_PROBE_DURATION_SECONDS) {
              const physicalContact =
                trackPairContact && Math.abs(signedColliderContactMismatch) <= 0.03;
              const visuallyInsideWheelBody =
                signedVerticalMismatch !== null && signedVerticalMismatch < -0.005;
              const hover =
                !physicalContact && signedColliderContactMismatch > 0.03;
              const passThrough =
                signedColliderContactMismatch < -0.08 ||
                radius < PART3_TRACK_INNER_RADIUS - BALL_RADIUS;
              const tunneling =
                passThrough ||
                !Number.isFinite(position.x) ||
                !Number.isFinite(position.y) ||
                !Number.isFinite(position.z);
              const passed =
                visibleSurface !== null &&
                !visuallyInsideWheelBody &&
                Math.abs(signedVerticalMismatch ?? Number.POSITIVE_INFINITY) <= 0.012 &&
                physicalContact &&
                !hover &&
                !passThrough &&
                !tunneling &&
                part3AlignmentMaxVisualBodySyncError <= 0.000001;
              part3AlignmentRunning = false;
              part3AlignmentFinished = true;
              publishPart3AlignmentReport({
                status: passed ? 'passed' : 'failed',
                sampleRadius: radius,
                sampleAzimuth: normalizedAngle(Math.atan2(position.x, position.z)),
                visibleSurfaceY: visibleSurface?.y ?? null,
                visibleSurfaceSource: visibleSurface?.source ?? null,
                darkTrackRadiusBand: PART3_DARK_TRACK_RADIUS_BAND,
                analyticColliderContactYBefore:
                  part3TrackHeight(radius, part3TrackVerticalOffset),
                analyticColliderContactYAfter: part3TrackHeight(
                  radius,
                  part3TrackVerticalOffset,
                ),
                rigidBodyCenterY: position.y,
                ballBottomY: bottom,
                ballRadius: BALL_RADIUS,
                signedVerticalMismatch,
                signedColliderContactMismatch,
                woodRetainingRingContact:
                  radius + BALL_RADIUS >= PART3_RETAINING_RIM_INNER_RADIUS - 0.005,
                visuallyInsideWheelBody,
                physicalContact,
                hover,
                passThrough,
                tunneling,
                maxVisualBodySyncError: part3AlignmentMaxVisualBodySyncError,
                detail: passed
                  ? 'PASS: the Rapier ball is on the visible upper outer-track surface with real contact.'
                  : 'FAIL: visible GLB surface and analytic Rapier contact are vertically misaligned.',
              });
              callbacksRef.current.onStateChange(
                passed ? 'loaded' : 'error',
                passed
                  ? 'PART 3 short visual/physics alignment probe passed'
                  : 'PART 3 short visual/physics alignment probe failed',
                passed ? undefined : 'physics-validation',
              );
            }
          }

          if (
            validationMode === 'part3' &&
            !alignmentOnly &&
            !outerLaneOnly &&
            !outerLaneSpinOnly &&
            world &&
            ballBody &&
            ballMesh &&
            (!part3Finished || part3PocketRunning)
          ) {
            const probe = PART3_PROBES[part3ProbeIndex];
            if (!part3Finished) {
              world.step();
            const position = ballBody.translation();
            const velocity = ballBody.linvel();
            const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
            const radius = Math.hypot(position.x, position.z);
            const surfaceY =
              radius >= 1.95 && radius <= PART3_RETAINING_RIM_INNER_RADIUS
                ? part3TrackHeight(radius, part3TrackVerticalOffset)
                : COLLIDER_PROFILE.innerFloorTop;
            const bottom = position.y - BALL_RADIUS;
            const penetration = Math.max(0, surfaceY - bottom);
            const separation = Math.max(0, bottom - surfaceY);
            let trackPairContact = false;
            if (physicsBallCollider && part3TrackCollider) {
              world.contactPairsWith(physicsBallCollider, (otherCollider) => {
                if (otherCollider.handle === part3TrackCollider?.handle) {
                  trackPairContact = true;
                }
              });
            }
            let deflectorPairContact = false;
            if (physicsBallCollider && part3DeflectorColliders.length > 0) {
              world.contactPairsWith(physicsBallCollider, (otherCollider) => {
                if (
                  part3DeflectorColliders.some(
                    (deflectorCollider) => deflectorCollider.handle === otherCollider.handle,
                  )
                ) {
                  deflectorPairContact = true;
                }
              });
            }
            const geometricTrackContact =
              radius >= PART3_TRACK_INNER_RADIUS &&
              radius <= PART3_TRACK_OUTER_RADIUS &&
              separation <= PART3_TRACK_CONTACT_TOLERANCE &&
              penetration <= 0.03;
            const onTrack = geometricTrackContact && trackPairContact;
            const trackAngle = normalizedAngle(Math.atan2(position.x, position.z));
            if (probe.kind === 'outer-track' && part3InwardDescentTime === null) {
              const measuredInner =
                part4MeasuredDeflectorInnerRadius ??
                PART2_ACTUAL_INWARD_EDGE_RADIUS;
              const measuredOuter =
                part4MeasuredDeflectorOuterRadius ??
                PART2_ACTUAL_INWARD_EDGE_RADIUS;
              const deflectorClearance =
                radius >= measuredOuter
                  ? radius - BALL_RADIUS - measuredOuter
                  : measuredInner - radius - BALL_RADIUS;
              part3EarlyLapMinimumDeflectorClearance =
                part3EarlyLapMinimumDeflectorClearance === null
                  ? deflectorClearance
                  : Math.min(
                      part3EarlyLapMinimumDeflectorClearance,
                      deflectorClearance,
                    );
            }
            if (probe.kind === 'deflector-approach') {
              if (deflectorPairContact && !part3DeflectorContact) {
                part3DeflectorContact = true;
                part3DeflectorContactTime = part3Elapsed;
                part3ImpactSpeedBefore = part3PreviousSpeed;
                const incomingDirection = new THREE.Vector3(
                  velocity.x,
                  0,
                  velocity.z,
                );
                if (incomingDirection.lengthSq() > 0.000001) {
                  part3ImpactDirectionBefore = incomingDirection.normalize();
                }
              } else if (
                part3DeflectorContact &&
                part3ImpactSpeedAfter === null &&
                part3DeflectorContactTime !== null &&
                part3Elapsed - part3DeflectorContactTime >= 0.05
              ) {
                part3ImpactSpeedAfter = speed;
                const outgoingDirection = new THREE.Vector3(
                  velocity.x,
                  0,
                  velocity.z,
                );
                if (outgoingDirection.lengthSq() > 0.000001) {
                  part3ImpactDirectionAfter = outgoingDirection.normalize();
                }
                const impactDirectionChange =
                  part3ImpactDirectionBefore && part3ImpactDirectionAfter
                    ? THREE.MathUtils.radToDeg(
                        part3ImpactDirectionBefore.angleTo(part3ImpactDirectionAfter),
                      )
                    : 0;
                part3BouncePlausible =
                  part3ImpactSpeedAfter <=
                    (part3ImpactSpeedBefore ?? part3ImpactSpeedAfter) * 1.05 &&
                  impactDirectionChange >= 10;
              }
              part3DeflectorPassThrough ||=
                radius <
                  (part4MeasuredDeflectorInnerRadius ??
                    PART2_ACTUAL_INWARD_EDGE_RADIUS) -
                    BALL_RADIUS -
                    0.01 &&
                !part3DeflectorContact;
            }
            const leftValidVolume =
              !Number.isFinite(position.x) ||
              !Number.isFinite(position.y) ||
              !Number.isFinite(position.z) ||
              radius < 0.18 ||
              radius > 3.08 ||
              position.y < COLLIDER_PROFILE.innerFloorTop - BALL_RADIUS - 0.08;
            part3Elapsed += FIXED_TIMESTEP;
            part3SampleFrames += 1;
            part3PeakSpeed = Math.max(
              part3PeakSpeed,
              Math.hypot(velocity.x, velocity.y, velocity.z),
            );
            part3MinRadius = Math.min(part3MinRadius, radius);
            part3MaxRadius = Math.max(part3MaxRadius, radius);
            part3MaxPenetration = Math.max(part3MaxPenetration, penetration);
            part3MaxSeparation = Math.max(part3MaxSeparation, separation);
            part3LeftValidVolume ||= leftValidVolume;
            part3ArtificialAcceleration ||=
              speed > Math.max(12, part3PreviousSpeed * 3);
            part3Clipping ||= penetration > 0.03;
            if (geometricTrackContact) {
              part3TrackSampleFrames += 1;
              part3TrackContactFrames += trackPairContact ? 1 : 0;
              part3TrackSpeedSum += speed;
              part3TrackEndSpeed = speed;
              part3Hover ||= !trackPairContact;
              if (part3TrackStartSpeed === 0) {
                part3TrackStartSpeed = speed;
                part3TrackAngle = trackAngle;
                part3TrackAngleStart = trackAngle;
              } else if (part3TrackAngle !== null) {
                const delta = THREE.MathUtils.euclideanModulo(
                  trackAngle - normalizedAngle(part3TrackAngle) + Math.PI,
                  TWO_PI,
                ) - Math.PI;
                part3TrackAngle += delta;
                part3TrackAngleEnd = part3TrackAngle;
                const completedLaps = Math.floor(
                  Math.abs(part3TrackAngle - part3TrackAngleStart!) / TWO_PI,
                );
                if (completedLaps > part3TrackCompletedLaps) {
                  part3TrackCompletedLaps = completedLaps;
                  part3TrackLapSpeeds.push(speed);
                }
              }
            } else if (
              part3InwardDescentTime === null &&
              part3TrackAngleStart !== null &&
              radius < PART3_TRACK_INNER_RADIUS
            ) {
              part3InwardDescentTime = part3Elapsed;
              part3InwardDescentRadius = radius;
              part3TrackAngleEnd ??= part3TrackAngle;
            }
            const inContactEnvelope = penetration <= 0.03 && separation <= 0.12;
            if (inContactEnvelope) part3ContactFrames += 1;
            ballMesh.position.set(position.x, position.y, position.z);
            part3MaxVisualBodySyncError = Math.max(
              part3MaxVisualBodySyncError,
              Math.hypot(
                ballMesh.position.x - position.x,
                ballMesh.position.y - position.y,
                ballMesh.position.z - position.z,
              ),
            );
            const rotation = ballBody.rotation();
            ballMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            part3PreviousSpeed = speed;
            if (part3Elapsed >= probe.durationSeconds) {
              completePart3Probe(position, velocity);
            }
          }
          }

          if (
            validationMode === 'part3' &&
            world &&
            ballBody &&
            ballMesh &&
            part3PocketRunning
          ) {
            world.step();
            const position = ballBody.translation();
            const velocity = ballBody.linvel();
            const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
            const radius = Math.hypot(position.x, position.z);
            const bottom = position.y - BALL_RADIUS;
            const rotorTangentialVelocity = rotorBody
              ? {
                  x: TEST_ANGULAR_SPEED * position.z,
                  y: 0,
                  z: -TEST_ANGULAR_SPEED * position.x,
                }
              : { x: 0, y: 0, z: 0 };
            const rotorRelativeSpeed = Math.hypot(
              velocity.x - rotorTangentialVelocity.x,
              velocity.y - rotorTangentialVelocity.y,
              velocity.z - rotorTangentialVelocity.z,
            );
            const floorPenetration = Math.max(0, POCKET_FLOOR_Y - bottom);
            const floorSeparation = Math.max(0, bottom - POCKET_FLOOR_Y);
            const rotorRotation = rotorBody?.rotation();
            const rotorBodyAngle = rotorRotation
              ? normalizedAngle(2 * Math.atan2(rotorRotation.y, rotorRotation.w))
              : 0;
            const rotorSyncError = rotorBody
              ? Math.abs(
                  THREE.MathUtils.euclideanModulo(
                    rotorBodyAngle - rotorAngleRef.current + Math.PI,
                    TWO_PI,
                  ) - Math.PI,
                )
              : 0;
            let pocketFloorContact = false;
            let pocketFretContact = false;
            if (physicsBallCollider) {
              world.contactPairsWith(physicsBallCollider, (otherCollider) => {
                const role = part3ColliderRoles.get(otherCollider.handle);
                if (
                  part3PocketBlockingColliderHandle === null &&
                  radius <= PART3_POCKET_TRANSITION_RADIUS + BALL_RADIUS
                ) {
                  part3PocketBlockingColliderHandle = otherCollider.handle;
                  part3PocketBlockingColliderType = role ?? 'unknown-collider';
                  part3PocketBlockingContactTime = part3PocketElapsed;
                }
                if (
                  role === 'pocket-floor-trimesh' ||
                  role === 'pocket-floor-catch-underlay'
                ) {
                  pocketFloorContact = true;
                }
                if (role === 'pocket-fret-cuboid') pocketFretContact = true;
              });
            }
            const insidePocket =
              radius >= POCKET_FLOOR_INNER_RADIUS + BALL_RADIUS &&
              radius <= POCKET_FLOOR_OUTER_RADIUS - BALL_RADIUS &&
              bottom >= POCKET_FLOOR_Y - 0.08 &&
              bottom <= POCKET_FLOOR_Y + 0.16;
            const enteredPocketVolume = insidePocket || pocketFloorContact;
            const leftValidVolume =
              !Number.isFinite(position.x) ||
              !Number.isFinite(position.y) ||
              !Number.isFinite(position.z) ||
              radius < 0.18 ||
              radius > 3.08 ||
              position.y < POCKET_FLOOR_Y - BALL_RADIUS - 0.18;
            part3PocketElapsed += FIXED_TIMESTEP;
            part3PocketPeakSpeed = Math.max(part3PocketPeakSpeed, speed);
            part3PocketMaxPenetration = Math.max(
              part3PocketMaxPenetration,
              enteredPocketVolume ? floorPenetration : 0,
            );
            part3PocketMaxSeparation = Math.max(
              part3PocketMaxSeparation,
              enteredPocketVolume ? floorSeparation : 0,
            );
            part3PocketMaxRotorSyncError = Math.max(
              part3PocketMaxRotorSyncError,
              rotorSyncError,
            );
            part3PocketLeftValidVolume ||= leftValidVolume;
            part3PocketTunneled ||= floorPenetration > 0.08;
            part3PocketArtificialEnergyInjection ||=
              speed > Math.max(8, part3PocketPreviousSpeed * 4);
            part3PocketEntered ||= enteredPocketVolume;
            part3PocketFretContact ||= pocketFretContact;
            if (pocketFretContact && part3PocketFirstFretContactSpeed === null) {
              part3PocketFirstFretContactSpeed = speed;
            }
            if (
              enteredPocketVolume &&
              rotorRelativeSpeed < 0.12 &&
              Math.abs(bottom - POCKET_FLOOR_Y) <= 0.12
            ) {
              part3PocketSettledFrames += 1;
            } else {
              part3PocketSettledFrames = 0;
            }
            ballMesh.position.set(position.x, position.y, position.z);
            const ballRotation = ballBody.rotation();
            ballMesh.quaternion.set(
              ballRotation.x,
              ballRotation.y,
              ballRotation.z,
              ballRotation.w,
            );
            part3PocketMaxVisualBodySyncError = Math.max(
              part3PocketMaxVisualBodySyncError,
              Math.hypot(
                ballMesh.position.x - position.x,
                ballMesh.position.y - position.y,
                ballMesh.position.z - position.z,
              ),
            );
            part3PocketPreviousSpeed = speed;

            if (part3PocketElapsed >= PART3_POCKET_PROBE_DURATION_SECONDS) {
              const finalAngle = normalizedAngle(
                Math.atan2(position.x, position.z) - rotorAngleRef.current,
              );
              const finalRadius = Math.hypot(position.x, position.z);
              const finalSpeed = Math.hypot(
                velocity.x,
                velocity.y,
                velocity.z,
              );
              const finalRotorRelativeSpeed = Math.hypot(
                velocity.x - rotorTangentialVelocity.x,
                velocity.y - rotorTangentialVelocity.y,
                velocity.z - rotorTangentialVelocity.z,
              );
              const finalPocketIndex =
                part3PocketEntered &&
                radius >= POCKET_FLOOR_INNER_RADIUS + BALL_RADIUS &&
                radius <= POCKET_FLOOR_OUTER_RADIUS
                  ? pocketIndexFromLocalPosition(
                      Math.sin(finalAngle),
                      Math.cos(finalAngle),
                    )
                  : null;
              const settled =
                part3PocketSettledFrames >= Math.round(0.5 / FIXED_TIMESTEP);
              const passed =
                part3PocketEntered &&
                settled &&
                finalPocketIndex === PART3_POCKET_TARGET_INDEX &&
                !part3PocketLeftValidVolume &&
                !part3PocketTunneled &&
                !part3PocketArtificialEnergyInjection &&
                part3PocketMaxRotorSyncError <= 0.001;
              part3PocketReport = {
                status: passed ? 'passed' : 'failed',
                label: 'Main-world number-slot descent',
                targetPocketIndex: PART3_POCKET_TARGET_INDEX,
                targetPocketNumber: EUROPEAN_SEQUENCE[PART3_POCKET_TARGET_INDEX],
                blockingColliderHandle: part3PocketBlockingColliderHandle,
                blockingColliderType: part3PocketBlockingColliderType,
                preFixBlockingColliderHandle:
                  PART3_PREFIX_BLOCKING_COLLIDER_HANDLE,
                preFixBlockingColliderType: PART3_PREFIX_BLOCKING_COLLIDER_TYPE,
                blockingColliderFirstContactTime:
                  part3PocketBlockingContactTime === null
                    ? null
                    : Number(part3PocketBlockingContactTime.toFixed(4)),
                correctedTransitionRadius: PART3_POCKET_TRANSITION_RADIUS,
                pocketFloorIntegrated: part3PocketColliders.length >= 1,
                fretColliderCount: part3PocketColliders.filter(
                  (collider) =>
                    part3ColliderRoles.get(collider.handle) ===
                    'pocket-fret-cuboid',
                ).length,
                enteredPocketVolume: part3PocketEntered,
                fretContact: part3PocketFretContact,
                peakSpeedAtFretContact:
                  part3PocketFirstFretContactSpeed === null
                    ? null
                    : Number(part3PocketFirstFretContactSpeed.toFixed(4)),
                maxPenetration: Number(part3PocketMaxPenetration.toFixed(4)),
                maxSeparation: Number(part3PocketMaxSeparation.toFixed(4)),
                settled,
                settledFrames: part3PocketSettledFrames,
                finalRadius: Number(finalRadius.toFixed(4)),
                finalHeight: Number(position.y.toFixed(4)),
                finalSpeed: Number(finalSpeed.toFixed(4)),
                finalRotorRelativeSpeed: Number(
                  finalRotorRelativeSpeed.toFixed(4),
                ),
                finalPocketIndex,
                finalPocketNumber:
                  finalPocketIndex === null
                    ? null
                    : EUROPEAN_SEQUENCE[finalPocketIndex],
                escaped: part3PocketLeftValidVolume,
                tunneled: part3PocketTunneled,
                hover: !part3PocketEntered || !settled,
                velocityExplosion: part3PocketArtificialEnergyInjection,
                artificialEnergyInjection: part3PocketArtificialEnergyInjection,
                maxRotorSyncError: Number(
                  part3PocketMaxRotorSyncError.toFixed(6),
                ),
                maxVisualBodySyncError: Number(
                  part3PocketMaxVisualBodySyncError.toFixed(6),
                ),
                detail: passed
                  ? `Main-world descent entered pocket ${finalPocketIndex} and settled on the continuous floor.`
                  : `Main-world descent failed: ${
                      [
                        !part3PocketEntered && 'pocket aperture blocked',
                        !part3PocketFretContact && 'no fret contact',
                        !settled && 'no stable floor settle',
                        finalPocketIndex !== PART3_POCKET_TARGET_INDEX &&
                          'wrong final pocket',
                        part3PocketLeftValidVolume && 'escape',
                        part3PocketTunneled && 'tunneling',
                        part3PocketArtificialEnergyInjection &&
                          'artificial energy injection',
                      ]
                        .filter(Boolean)
                        .join(', ') || 'review required'
                    }.`,
              };
              part3PocketRunning = false;
              const outerPassed = part3Results.every(
                (probeResult) => probeResult.outcome !== 'failed',
              );
              publishPart3Report(
                outerPassed && passed ? 'passed' : 'failed',
                outerPassed && passed
                  ? 'Outer-track, deflector, and main-world pocket probes passed.'
                  : 'The main-world pocket transition probe failed.',
              );
            }
          }

          if (validationMode === 'part4' && world && ballBody && ballMesh && rotorBody && !part4Finished) {
            const probe = PART4_PROBES[part4ProbeIndex];
            world.step();
            const position = ballBody.translation();
            const velocity = ballBody.linvel();
            const radius = Math.hypot(position.x, position.z);
            const bottom = position.y - BALL_RADIUS;
            const penetration = Math.max(0, ROTOR_CONTACT_HEIGHT - bottom);
            const separation = Math.max(0, bottom - ROTOR_CONTACT_HEIGHT);
            const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
            const leftValidVolume =
              !Number.isFinite(position.x) ||
              !Number.isFinite(position.y) ||
              !Number.isFinite(position.z) ||
              radius < 0.18 ||
              radius > 3.08 ||
              position.y < COLLIDER_PROFILE.innerFloorTop - BALL_RADIUS - 0.08;
            const rotorRotation = rotorBody.rotation();
            const rotorBodyAngle = normalizedAngle(
              2 * Math.atan2(rotorRotation.y, rotorRotation.w),
            );
            const rotorSyncError = Math.abs(
              THREE.MathUtils.euclideanModulo(
                rotorBodyAngle - rotorAngleRef.current + Math.PI,
                TWO_PI,
              ) - Math.PI,
            );
            const stationaryPositionDrift = stationaryGroup
              ? stationaryGroup.position.distanceTo(stationaryBaselinePosition)
              : Number.POSITIVE_INFINITY;
            const stationaryRotationDrift = stationaryGroup
              ? stationaryGroup.quaternion.angleTo(stationaryBaselineQuaternion)
              : Number.POSITIVE_INFINITY;
            part4Elapsed += FIXED_TIMESTEP;
            part4SampleFrames += 1;
            part4PeakSpeed = Math.max(part4PeakSpeed, speed);
            part4MaxEnergyGain = Math.max(
              part4MaxEnergyGain,
              Math.max(0, speed * speed - part4InitialSpeed * part4InitialSpeed),
            );
            part4MinRadius = Math.min(part4MinRadius, radius);
            part4MaxRadius = Math.max(part4MaxRadius, radius);
            part4MaxPenetration = Math.max(part4MaxPenetration, penetration);
            part4MaxSeparation = Math.max(part4MaxSeparation, separation);
            part4MaxRotorSyncError = Math.max(part4MaxRotorSyncError, rotorSyncError);
            part4LeftValidVolume ||= leftValidVolume;
            part4OutsideTurretStationary &&=
              stationaryPositionDrift <= 0.000001 &&
              stationaryRotationDrift <= 0.000001;
            if (penetration <= 0.03 && separation <= 0.12) {
              part4ContactFrames += 1;
            }
            ballMesh.position.set(position.x, position.y, position.z);
            part4MaxVisualBodySyncError = Math.max(
              part4MaxVisualBodySyncError,
              Math.hypot(
                ballMesh.position.x - position.x,
                ballMesh.position.y - position.y,
                ballMesh.position.z - position.z,
              ),
            );
            const rotation = ballBody.rotation();
            ballMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            if (part4Elapsed >= probe.durationSeconds) {
              completePart4Probe(position, velocity);
            }
          }

          if (validationMode === 'part2' && world && ballBody && ballMesh && dropStarted && dropSteps < DROP_DURATION_SECONDS / FIXED_TIMESTEP) {
            world.step();
            const position = ballBody.translation();
            const velocity = ballBody.linvel();
            const radius = Math.hypot(position.x, position.z);
            const surfaceY = radius >= BOWL_PROFILE[0][0] ? profileHeight(radius) : COLLIDER_PROFILE.innerFloorTop;
            const bottom = position.y - BALL_RADIUS;
            const penetration = Math.max(0, surfaceY - bottom);
            const separation = Math.max(0, bottom - surfaceY);
            maxPenetration = Math.max(maxPenetration, penetration);
            maxSeparation = Math.max(maxSeparation, separation);
            if (!firstContact && previousVerticalVelocity < -0.08 && velocity.y >= -0.08 && position.y < DROP_TRACK_Y + BALL_RADIUS + 0.12) {
              firstContact = roundedVector(new THREE.Vector3(position.x, position.y, position.z));
              firstContactRadius = Number(radius.toFixed(4));
              firstContactTime = Number(((dropSteps + 1) * FIXED_TIMESTEP).toFixed(4));
              visibleSurfaceMatch = Math.abs(position.y - (surfaceY + BALL_RADIUS)) < 0.08;
            }
            ballMesh.position.set(position.x, position.y, position.z);
            maxVisualBodySyncError = Math.max(
              maxVisualBodySyncError,
              Math.hypot(
                ballMesh.position.x - position.x,
                ballMesh.position.y - position.y,
                ballMesh.position.z - position.z,
              ),
            );
            const rotation = ballBody.rotation();
            ballMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            previousVerticalVelocity = velocity.y;
            dropSteps += 1;
            if (dropSteps === Math.floor(DROP_DURATION_SECONDS / FIXED_TIMESTEP)) {
              const finalPosition = roundedVector(new THREE.Vector3(position.x, position.y, position.z));
              const finalSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
              const passThrough =
                position.y < COLLIDER_PROFILE.innerFloorTop - BALL_RADIUS - 0.08 ||
                radius > 3.08 ||
                !Number.isFinite(position.y);
              const finalSeparation = Math.max(0, (position.y - BALL_RADIUS) - surfaceY);
              const passed = Boolean(firstContact) && !passThrough && maxPenetration < 0.02 && visibleSurfaceMatch;
              publishDropReport({
                status: passed ? 'passed' : 'failed',
                initialPosition: roundedVector(new THREE.Vector3(...DROP_INITIAL_POSITION)),
                firstContactPosition: firstContact,
                firstContactRadius,
                firstContactTime,
                finalPosition,
                finalSpeed: Number(finalSpeed.toFixed(4)),
                maxPenetration: Number(maxPenetration.toFixed(4)),
                finalSeparation: Number(finalSeparation.toFixed(4)),
                passThrough,
                visibleSurfaceMatch,
                ccdEnabled,
                maxVisualBodySyncError: Number(maxVisualBodySyncError.toFixed(6)),
                colliderProfile: COLLIDER_PROFILE,
                detail: passed
                  ? 'Zero-horizontal-velocity drop contacted the derived visible profile without pass-through.'
                  : 'Drop did not satisfy the PART 2 contact envelope.',
              });
            }
          }
          accumulator -= FIXED_TIMESTEP;
        }
        controls?.update();
        renderer?.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      render();

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        window.removeEventListener('roulette-reset-view', resetView);
        observer.disconnect();
        controls?.dispose();
        renderer?.dispose();
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        });
        if (ballBody && world) world.removeRigidBody(ballBody);
        if (rotorBody && world) world.removeRigidBody(rotorBody);
        void physicsBallCollider;
        void rotorColliders;
        world?.free();
      };
    } catch (error) {
      console.error('PART 2 roulette scene failed to initialize', error);
      const initializationDetail =
        error instanceof Error ? error.message : String(error);
      callbacksRef.current.onStateChange(
        'error',
        initializationDetail,
        initializationDetail.includes('visible-deflector audit') ||
          initializationDetail.includes('Deflector audit')
          ? 'geometry-audit'
          : 'initialization',
      );
      return () => renderer?.dispose();
    }
  }, [loadKey]);

  useEffect(() => {
    if (rotorAngleRef.current !== rotorAngle) {
      rotorAngleRef.current = normalizedAngle(rotorAngle);
    }
  }, [rotorAngle]);

  useEffect(() => {
    if (showPhysicsDebug) {
      // The collider shell remains invisible by default; this flag is reserved
      // for the next debug-overlay pass without changing collider behavior.
    }
  }, [showPhysicsDebug]);

  const renderPart3Report = () => (
    <div
      className="part2-drop-report"
      data-testid="part3-validation-report"
      data-status={part3Report?.status ?? 'waiting'}
      aria-live="polite"
    >
      {part3Report ? (
        <>
          <strong>{part3Report.detail}</strong>
          <span>
            CCD {part3Report.ccdEnabled ? 'enabled' : 'disabled'} · 120 Hz · 2 targeted probes ·
            measured dark track r {DARK_OUTER_TRACK_RADIUS.toFixed(4)} / y {DARK_OUTER_TRACK_HEIGHT.toFixed(4)} ·
            launch lane r {PART3_LAUNCH_RADIUS.toFixed(4)} · retaining inner r {PART3_RETAINING_RIM_INNER_RADIUS.toFixed(4)}
          </span>
          {part3Report.results.map((result) => (
            <span key={result.id}>
              {result.label}: {result.outcome.toUpperCase()} · launch r {result.spawnRadius.toFixed(4)} / y {result.spawnHeight.toFixed(4)} ·
              vtan {Math.hypot(result.initialVelocity.x, result.initialVelocity.z).toFixed(4)} ·
              spin {result.initialAngularSpin.z.toFixed(4)} · laps {result.lapCount.toFixed(3)} ·
              track {result.trackDuration.toFixed(4)} s · avg/peak {result.averageTrackSpeed.toFixed(4)} / {result.peakSpeed.toFixed(4)} ·
              speed {result.trackStartSpeed.toFixed(4)}→{result.trackEndSpeed.toFixed(4)} · energy loss {(result.energyLossRatio * 100).toFixed(2)}% ·
              clearance {result.earlyLapMinimumDeflectorClearance?.toFixed(4) ?? '—'} m
            </span>
          ))}
          {part3Report.results.map((result) => (
            <span key={`${result.id}-safety`}>
              {result.label}: contact {result.continuousTrackContact ? 'continuous' : 'interrupted'} ·
              inward {result.inwardDescentTime?.toFixed(4) ?? '—'} s @ r {result.inwardDescentRadius?.toFixed(4) ?? '—'} ·
              lap speeds [{result.trackLapSpeeds.map((speed) => speed.toFixed(3)).join(', ')}] ·
              roll/slide {result.naturalRollOrSlide ? 'natural' : 'invalid'} · bounce {result.bouncePlausible ? 'plausible' : 'invalid'} ·
              deflector {result.deflectorContact ? 'yes' : 'no'} · impact {result.impactSpeedBefore?.toFixed(4) ?? '—'}→{result.impactSpeedAfter?.toFixed(4) ?? '—'} m/s ·
              direction Δ {result.impactDirectionChangeDegrees?.toFixed(1) ?? '—'}° · pass-through {result.noPassThrough ? 'no' : 'yes'} ·
              colliders {result.deflectorColliderCount}×{result.deflectorColliderType} · μ {result.deflectorColliderFriction.toFixed(2)} · e {result.deflectorColliderRestitution.toFixed(2)} ·
              visual alignment {result.visualContactAlignmentCredible ? 'credible' : 'unverified'} ·
              hover {result.hover ? 'yes' : 'no'} · clipping {result.clipping ? 'yes' : 'no'} ·
              escape {result.leftValidVolume ? 'yes' : 'no'} · tunneling {result.tunneling ? 'yes' : 'no'} ·
              velocity spike {result.velocityExplosion ? 'yes' : 'no'} · artificial acceleration {result.artificialAcceleration ? 'yes' : 'no'} ·
              pen {result.maxPenetration.toFixed(4)} · sep {result.maxSeparation.toFixed(4)} ·
              ball sync {result.maxVisualBodySyncError.toFixed(6)} · rotor sync {result.maxRotorSyncError.toFixed(6)} · {result.detail}
            </span>
          ))}
          {part3Report.pocketDescent ? (
            <span>
              {part3Report.pocketDescent.label}: {part3Report.pocketDescent.status.toUpperCase()} ·
              blocker {part3Report.pocketDescent.blockingColliderType ?? '—'} #
              {part3Report.pocketDescent.blockingColliderHandle ?? '—'} @
              {part3Report.pocketDescent.blockingColliderFirstContactTime?.toFixed(4) ?? '—'} s ·
              pre-fix blocker {part3Report.pocketDescent.preFixBlockingColliderType ?? '—'} #
              {part3Report.pocketDescent.preFixBlockingColliderHandle ?? '—'} ·
              transition r {part3Report.pocketDescent.correctedTransitionRadius.toFixed(4)} ·
              floor {part3Report.pocketDescent.pocketFloorIntegrated ? 'integrated' : 'not integrated'} ·
              frets {part3Report.pocketDescent.fretColliderCount} · entered {part3Report.pocketDescent.enteredPocketVolume ? 'yes' : 'no'} ·
              fret contact {part3Report.pocketDescent.fretContact ? 'yes' : 'no'} ·
              peak fret {part3Report.pocketDescent.peakSpeedAtFretContact?.toFixed(4) ?? '—'} ·
              pen/sep {part3Report.pocketDescent.maxPenetration.toFixed(4)} / {part3Report.pocketDescent.maxSeparation.toFixed(4)} ·
              settled {part3Report.pocketDescent.settled ? 'yes' : 'no'} ({part3Report.pocketDescent.settledFrames} frames) ·
              final r/y {part3Report.pocketDescent.finalRadius.toFixed(4)} / {part3Report.pocketDescent.finalHeight.toFixed(4)} ·
              speed rel {part3Report.pocketDescent.finalSpeed.toFixed(4)} / {part3Report.pocketDescent.finalRotorRelativeSpeed.toFixed(4)} ·
              final {part3Report.pocketDescent.finalPocketNumber ?? '—'} / {part3Report.pocketDescent.finalPocketIndex ?? '—'} ·
              escape {part3Report.pocketDescent.escaped ? 'yes' : 'no'} · tunnel {part3Report.pocketDescent.tunneled ? 'yes' : 'no'} ·
              hover {part3Report.pocketDescent.hover ? 'yes' : 'no'} · velocity spike {part3Report.pocketDescent.velocityExplosion ? 'yes' : 'no'} ·
              artificial energy {part3Report.pocketDescent.artificialEnergyInjection ? 'yes' : 'no'} ·
              rotor sync {part3Report.pocketDescent.maxRotorSyncError.toFixed(6)} · {part3Report.pocketDescent.detail}
            </span>
          ) : null}
        </>
      ) : (
        'Waiting for outer-track smoke spins.'
      )}
    </div>
  );

  const renderPart3AlignmentReport = () => (
    <div
      className="part2-drop-report"
      data-testid="part3-alignment-report"
      data-status={part3AlignmentReport?.status ?? 'waiting'}
      aria-live="polite"
    >
      {part3AlignmentReport ? (
        <>
          <strong>{part3AlignmentReport.detail}</strong>
          <span>
              short outer-track contact probe · dark radius band {part3AlignmentReport.darkTrackRadiusBand[0].toFixed(4)}–{part3AlignmentReport.darkTrackRadiusBand[1].toFixed(4)} ·
              launch r {part3AlignmentReport.sampleRadius.toFixed(4)} ·
              azimuth {THREE.MathUtils.radToDeg(part3AlignmentReport.sampleAzimuth).toFixed(2)}° ·
            ball radius {part3AlignmentReport.ballRadius.toFixed(4)}
          </span>
          <span>
            visible GLB upper surface Y {part3AlignmentReport.visibleSurfaceY?.toFixed(4) ?? '—'} ·
            source {part3AlignmentReport.visibleSurfaceSource ?? '—'} ·
            collider contact Y before {part3AlignmentReport.analyticColliderContactYBefore.toFixed(4)} ·
            after {part3AlignmentReport.analyticColliderContactYAfter.toFixed(4)}
          </span>
          <span>
            rigid-body center Y {part3AlignmentReport.rigidBodyCenterY.toFixed(4)} ·
            ball bottom Y {part3AlignmentReport.ballBottomY.toFixed(4)} ·
            visible signed mismatch {part3AlignmentReport.signedVerticalMismatch?.toFixed(4) ?? '—'} ·
              collider signed mismatch {part3AlignmentReport.signedColliderContactMismatch.toFixed(4)} ·
              wood-ring contact {part3AlignmentReport.woodRetainingRingContact ? 'yes' : 'no'}
          </span>
          <span>
            visually inside wheel body {part3AlignmentReport.visuallyInsideWheelBody ? 'yes' : 'no'} ·
            physical contact {part3AlignmentReport.physicalContact ? 'yes' : 'no'} ·
            hover {part3AlignmentReport.hover ? 'yes' : 'no'} ·
            pass-through {part3AlignmentReport.passThrough ? 'yes' : 'no'} ·
            tunneling {part3AlignmentReport.tunneling ? 'yes' : 'no'} ·
            ball sync {part3AlignmentReport.maxVisualBodySyncError.toFixed(6)}
          </span>
        </>
      ) : (
        'Waiting for the short visual/physics alignment probe.'
      )}
    </div>
  );

  const renderPart3OuterLaneReport = () => (
    <div
      className="part2-drop-report"
      data-testid="part3-outer-lane-report"
      data-status={part3OuterLaneReport?.status ?? 'waiting'}
      aria-live="polite"
    >
      {part3OuterLaneReport ? (
        <>
          <strong>{part3OuterLaneReport.detail}</strong>
          <span>
            PART 2 short tangential probe · dark race r {part3OuterLaneReport.darkTrackInnerRadius.toFixed(4)}–
            {part3OuterLaneReport.darkTrackOuterRadius.toFixed(4)} · retaining rim inner r{' '}
            {part3OuterLaneReport.retainingRimInnerRadius.toFixed(4)} · nearest deflector outer r{' '}
            {part3OuterLaneReport.nearestDeflectorOuterRadius.toFixed(4)} · ball r{' '}
            {part3OuterLaneReport.ballRadius.toFixed(4)}
          </span>
          <span>
            chosen launch r {part3OuterLaneReport.chosenLaunchRadius.toFixed(4)} · launch Y{' '}
            {part3OuterLaneReport.launchHeight.toFixed(4)} · rim clearance{' '}
            {part3OuterLaneReport.radialClearanceToRim.toFixed(4)} · deflector clearance{' '}
            {part3OuterLaneReport.radialClearanceToDeflector.toFixed(4)} · outer-edge clearance{' '}
            {part3OuterLaneReport.outerTrackEdgeClearance.toFixed(4)}
          </span>
          <span>
            tangent direction ({part3OuterLaneReport.tangentialLaunchDirection.x.toFixed(4)},{' '}
            {part3OuterLaneReport.tangentialLaunchDirection.y.toFixed(4)},{' '}
            {part3OuterLaneReport.tangentialLaunchDirection.z.toFixed(4)}) · linear speed{' '}
            {part3OuterLaneReport.initialLinearSpeed.toFixed(4)} · angular spin (
            {part3OuterLaneReport.initialAngularSpin.x.toFixed(4)},{' '}
            {part3OuterLaneReport.initialAngularSpin.y.toFixed(4)},{' '}
            {part3OuterLaneReport.initialAngularSpin.z.toFixed(4)})
          </span>
          <span>
            floor contact normal ({part3OuterLaneReport.floorContactNormal.x.toFixed(4)},{' '}
            {part3OuterLaneReport.floorContactNormal.y.toFixed(4)},{' '}
            {part3OuterLaneReport.floorContactNormal.z.toFixed(4)}) · outer-wall normal (
            {part3OuterLaneReport.outerWallContactNormal.x.toFixed(4)},{' '}
            {part3OuterLaneReport.outerWallContactNormal.y.toFixed(4)},{' '}
            {part3OuterLaneReport.outerWallContactNormal.z.toFixed(4)})
          </span>
          <span>
            radius {part3OuterLaneReport.minRadius.toFixed(4)}–
            {part3OuterLaneReport.maxRadius.toFixed(4)} · minimum rim clearance{' '}
            {part3OuterLaneReport.minRimClearance.toFixed(4)} · minimum deflector clearance{' '}
            {part3OuterLaneReport.minDeflectorClearance.toFixed(4)} · inner containment r{' '}
            {part3OuterLaneReport.innerContainmentRadius.toFixed(4)} / center limit{' '}
            {part3OuterLaneReport.innerContainmentCenterLimit.toFixed(4)} · minimum inner clearance{' '}
            {part3OuterLaneReport.minimumInnerContainmentClearance.toFixed(4)} · peak speed{' '}
            {part3OuterLaneReport.peakSpeed.toFixed(4)} · inward radial drift{' '}
            {part3OuterLaneReport.inwardRadialDrift.toFixed(4)} · track contact{' '}
            {part3OuterLaneReport.physicalTrackContact ? 'yes' : 'no'} · outer lane{' '}
            {part3OuterLaneReport.staysOnOuterDarkLane ? 'stable' : 'unstable'}
          </span>
          <span>
            premature deflector {part3OuterLaneReport.prematureDeflectorContact ? 'yes' : 'no'} · wood contact{' '}
            {part3OuterLaneReport.woodContact ? 'yes' : 'no'} · hover{' '}
            {part3OuterLaneReport.hover ? 'yes' : 'no'} · clipping{' '}
            {part3OuterLaneReport.clipping ? 'yes' : 'no'} · tunneling{' '}
            {part3OuterLaneReport.tunneling ? 'yes' : 'no'} · escape{' '}
            {part3OuterLaneReport.escaped ? 'yes' : 'no'} · velocity spike{' '}
            {part3OuterLaneReport.velocitySpike ? 'yes' : 'no'} · sync{' '}
            {part3OuterLaneReport.maxVisualBodySyncError.toFixed(6)}
          </span>
        </>
      ) : (
        'Waiting for the short PART B outer-lane probe.'
      )}
    </div>
  );

  const renderPart2RacePlacementReport = () => (
    <div
      className="part2-drop-report part2-race-placement-report"
      data-testid="part2-race-placement-report"
      data-status={part2RacePlacementReport?.status ?? 'waiting'}
      aria-live="polite"
    >
      {part2RacePlacementReport ? (
        <>
          <strong>{part2RacePlacementReport.detail}</strong>
          <span>
            measured recessed race r {part2RacePlacementReport.channelInnerRadius.toFixed(4)}–
            {part2RacePlacementReport.channelOuterRadius.toFixed(4)} · running floor r{' '}
            {PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_INNER_INDEX][0].toFixed(4)}–
            {PART2_CHANNEL_PROFILE[PART2_CHANNEL_FLOOR_OUTER_INDEX][0].toFixed(4)} · ball radius {BALL_RADIUS.toFixed(4)} ·
            active collider {part2RacePlacementReport.activeRaceCollider}
          </span>
          <span>
            running surface Y {part2RacePlacementReport.runningSurfaceYRange[0].toFixed(4)}–
            {part2RacePlacementReport.runningSurfaceYRange[1].toFixed(4)} · slope{' '}
            {part2RacePlacementReport.runningSurfaceSlope[0].toFixed(4)}→
            {part2RacePlacementReport.runningSurfaceSlope[1].toFixed(4)} · outer wall/lip Y{' '}
            {part2RacePlacementReport.outerWallY.toFixed(4)} · inner transition Y{' '}
            {part2RacePlacementReport.innerTransitionY.toFixed(4)}
          </span>
          <span>
            GLB inner-transition samples [{part2RacePlacementReport.visibleInnerTransitionProfile.map(
              ([radius, y]) => `${radius.toFixed(4)}/${y.toFixed(4)}`,
            ).join(', ') || 'unavailable'}] · analytic inner [
            {part2RacePlacementReport.analyticInnerTransitionProfile.map(
              ([radius, y]) => `${radius.toFixed(4)}/${y.toFixed(4)}`,
            ).join(', ')}]
          </span>
          <span>
            GLB inner-surface samples [{part2RacePlacementReport.visibleInnerSurfaceProfile.map(
              ([radius, y]) => `${radius.toFixed(4)}/${y.toFixed(4)}`,
            ).join(', ') || 'unavailable'}]
          </span>
          <span>
            GLB wall samples [{part2RacePlacementReport.visibleOuterWallProfile.map(
              ([radius, y]) => `${radius.toFixed(4)}/${y.toFixed(4)}`,
            ).join(', ') || 'unavailable'}] · analytic wall [
            {part2RacePlacementReport.analyticOuterWallProfile.map(
              ([radius, y]) => `${radius.toFixed(4)}/${y.toFixed(4)}`,
            ).join(', ')}]
          </span>
          <span>
            static ball center r/y {part2RacePlacementReport.spawnRadius.toFixed(4)} /{' '}
            {part2RacePlacementReport.spawnHeight.toFixed(4)} · contact normal (
            {part2RacePlacementReport.contactNormal.x.toFixed(4)},{' '}
            {part2RacePlacementReport.contactNormal.y.toFixed(4)},{' '}
            {part2RacePlacementReport.contactNormal.z.toFixed(4)}) · radius range{' '}
            {part2RacePlacementReport.minRadius.toFixed(4)}–
            {part2RacePlacementReport.maxRadius.toFixed(4)}
          </span>
          <span>
            ball-bottom contact r/y {part2RacePlacementReport.ballBottomContactRadius.toFixed(4)} /{' '}
            {part2RacePlacementReport.ballBottomContactY.toFixed(4)} · nearest floor r/y{' '}
            {part2RacePlacementReport.nearestFloorRadius.toFixed(4)} /{' '}
            {part2RacePlacementReport.nearestFloorY.toFixed(4)} · floor-center envelope{' '}
            {part2RacePlacementReport.centerFloorEnvelope[0].toFixed(4)}–
            {part2RacePlacementReport.centerFloorEnvelope[1].toFixed(4)}
          </span>
          <span>
            inner-transition distance {part2RacePlacementReport.innerTransitionDistance.toFixed(4)} ·
            outer-wall distance {part2RacePlacementReport.outerWallDistance.toFixed(4)} · collider handle{' '}
            {part2RacePlacementReport.contactColliderHandle ?? 'none'} /{' '}
            {part2RacePlacementReport.contactColliderType} · numeric placement{' '}
            {part2RacePlacementReport.numericPlacementPassed ? 'pass' : 'fail'} · visual gate{' '}
            {part2RacePlacementReport.visualGateVerified ? 'verified' : 'unverified'}
          </span>
          <span>
            physical contact {part2RacePlacementReport.physicalContact ? 'yes' : 'no'} · visible GLB match{' '}
            {part2RacePlacementReport.visibleSurfaceMatch ? 'yes' : 'no'} · wood/top contact{' '}
            {part2RacePlacementReport.onWoodTop ? 'yes' : 'no'} · broad support active{' '}
            {part2RacePlacementReport.broadSupportActive ? 'yes' : 'no'} · hover{' '}
            {part2RacePlacementReport.hover ? 'yes' : 'no'}
          </span>
          <code>
            disabled: {part2RacePlacementReport.disabledColliders.join(' · ')}
          </code>
        </>
      ) : (
        'Waiting for the static recessed dark-race placement gate.'
      )}
    </div>
  );

  const renderPart6TelemetryReport = () => (
    <div
      className="part2-drop-report"
      data-testid="part6-full-spin-telemetry-report"
      data-status={part6TelemetryReport?.status ?? 'waiting'}
      data-safety={part6TelemetryReport?.safetyStatus ?? 'pending'}
      data-calibration={
        part6TelemetryReport?.calibrationStatus ?? 'not-evaluated'
      }
      aria-live="polite"
    >
      {part6TelemetryReport ? (
        <>
          <strong>{part6TelemetryReport.detail}</strong>
          <span>
            Telemetry {part6TelemetryReport.status.toUpperCase()} · Safety{' '}
            {part6TelemetryReport.safetyStatus.toUpperCase()} · Calibration{' '}
            {part6TelemetryReport.calibrationStatus
              .replace('-', ' ')
              .toUpperCase()}
          </span>
          <span>
            schema {part6TelemetryReport.schemaVersion} · seeds{' '}
            {part6TelemetryReport.completedCount}/
            {part6TelemetryReport.seedCount} · fixed step{' '}
            {part6TelemetryReport.fixedTimestep.toFixed(6)} s · max spin{' '}
            {part6TelemetryReport.maxDurationSeconds.toFixed(1)} s ·
            timeouts {part6TelemetryReport.timedOutCount}
          </span>
          <span>
            laps median/min/max{' '}
            {part6TelemetryReport.medianLapCount?.toFixed(3) ?? '—'} /{' '}
            {part6TelemetryReport.minLapCount?.toFixed(3) ?? '—'} /{' '}
            {part6TelemetryReport.maxLapCount?.toFixed(3) ?? '—'} ·
            4–5 laps {part6TelemetryReport.fourToFiveLapCount}/
            {part6TelemetryReport.seedCount} · median track contact{' '}
            {part6TelemetryReport.medianTrackContactRatio === null
              ? '—'
              : (
                  part6TelemetryReport.medianTrackContactRatio * 100
                ).toFixed(1)}
            %
          </span>
          <span>
            inward {(part6TelemetryReport.inwardTransitionRate * 100).toFixed(1)}
            % · deflector{' '}
            {(part6TelemetryReport.deflectorContactRate * 100).toFixed(1)}% ·
            pocket {(part6TelemetryReport.pocketEntryRate * 100).toFixed(1)}% ·
            settled {(part6TelemetryReport.settleRate * 100).toFixed(1)}% ·
            safety fail{' '}
            {(part6TelemetryReport.safetyFailureRate * 100).toFixed(1)}% ·
            phase-order failures {part6TelemetryReport.phaseSequenceFailureCount}
          </span>
          <span>
            unchanged physics: μ{' '}
            {part6TelemetryReport.trackFriction.toFixed(2)} · linear/angular
            damping {part6TelemetryReport.linearDamping.toFixed(2)} /{' '}
            {part6TelemetryReport.angularDamping.toFixed(2)}
          </span>
          {part6TelemetryReport.results.map((result) => (
            <span key={result.id}>
              seed {result.seed} · reset{' '}
              {result.stateResetVerified ? 'verified' : 'FAIL'} (Δp{' '}
              {result.resetPositionError.toExponential(1)} · Δv{' '}
              {result.resetVelocityError.toExponential(1)} · Δω{' '}
              {result.resetAngularVelocityError.toExponential(1)} · Δq{' '}
              {result.resetRotationError.toExponential(1)} · Δrotor{' '}
              {result.resetRotorAngleError.toExponential(1)}) · launch{' '}
              {THREE.MathUtils.radToDeg(result.launchAzimuth).toFixed(1)}° @{' '}
              {result.launchSpeed.toFixed(2)} wu/s (
              {result.launchSpeedMetersPerSecond.toFixed(2)} m/s) · laps{' '}
              {result.lapCount.toFixed(3)} · contact{' '}
              {(result.trackContactRatio * 100).toFixed(1)}% · speed{' '}
              {result.trackStartSpeed.toFixed(3)}→
              {result.trackEndSpeed.toFixed(3)} / peak{' '}
              {result.peakSpeed.toFixed(3)} · inward{' '}
              {result.inwardTransitionTime?.toFixed(3) ?? '—'} s · rotor entry{' '}
              {result.rotorEntryTime?.toFixed(3) ?? '—'} s
            </span>
          ))}
          {part6TelemetryReport.results.map((result) => (
            <span key={`${result.id}-chain`}>
              seed {result.seed} phases{' '}
              {result.phases.map((event) => event.phase).join(' → ') || '—'} ·
              order {result.phaseSequenceValid ? 'valid' : 'FAIL'} ·
              deflector {result.deflectorContactCount} @{' '}
              {result.firstDeflectorContactTime?.toFixed(3) ?? '—'} s · impact{' '}
              {result.impactSpeedBefore?.toFixed(3) ?? '—'}→
              {result.impactSpeedAfter?.toFixed(3) ?? '—'} / Δ{' '}
              {result.impactDirectionChangeDegrees?.toFixed(1) ?? '—'}° · fret{' '}
              {result.fretContact ? 'yes' : 'no'} · pocket{' '}
              {result.pocketEntered ? 'yes' : 'no'} · settled{' '}
              {result.settled ? 'yes' : 'no'} · final{' '}
              {result.finalPocketNumber ?? '—'} · timeout{' '}
              {result.timedOut ? 'yes' : 'no'}
            </span>
          ))}
          {part6TelemetryReport.results.map((result) => (
            <span key={`${result.id}-transition`}>
              seed {result.seed} transition r{' '}
              {result.transitionMinRadius?.toFixed(3) ?? '—'}–
              {result.transitionMaxRadius?.toFixed(3) ?? '—'} / Y{' '}
              {result.transitionMinY?.toFixed(3) ?? '—'}–
              {result.transitionMaxY?.toFixed(3) ?? '—'} · surface pen/sep{' '}
              {result.transitionMaxSurfacePenetration.toFixed(3)}/
              {result.transitionMaxSurfaceSeparation.toFixed(3)} · unsupported{' '}
              {result.maxUnsupportedTransitionDuration.toFixed(3)} s · roles{' '}
              {result.transitionContactRoles.join(', ') || '—'} · track pen/sep{' '}
              {result.maxTrackPenetration.toFixed(3)}/
              {result.maxTrackSeparation.toFixed(3)} · pocket pen/sep{' '}
              {result.maxPocketFloorPenetration.toFixed(3)}/
              {result.maxPocketFloorSeparation.toFixed(3)} · safety{' '}
              {result.safetyPassed ? 'PASS' : 'FAIL'}
            </span>
          ))}
        </>
      ) : (
        'Waiting for the PART 6A.1 deterministic full-spin telemetry batch.'
      )}
    </div>
  );

  const renderPart2OuterLaneSpinReport = () => (
    <div
      className="part2-drop-report"
      data-testid="part2-outer-spin-report"
      data-status={part3OuterLaneSpinReport?.status ?? 'waiting'}
      aria-live="polite"
    >
      {part3OuterLaneSpinReport ? (
        <>
          <strong>{part3OuterLaneSpinReport.detail}</strong>
          <span>
            PART 2 real GLB dark side-track · actual outside trimesh · 120 Hz ·
            CCD enabled · friction μ {part3OuterLaneSpinReport.trackFriction.toFixed(2)} ·
            linear/angular damping {part3OuterLaneSpinReport.linearDamping.toFixed(2)} /{' '}
            {part3OuterLaneSpinReport.angularDamping.toFixed(2)} · launch radius{' '}
            {part3OuterLaneSpinReport.operationalLaunchRadius.toFixed(4)} · ball radius{' '}
            {part3OuterLaneSpinReport.ballRadius.toFixed(4)}
          </span>
          {part3OuterLaneSpinReport.results.map((result) => (
            <span key={result.id}>
              {result.label}: {result.outcome.toUpperCase()} · vtan{' '}
              {result.launchSpeed.toFixed(4)} · laps {result.lapCount.toFixed(3)} ·
              track {result.trackDuration.toFixed(3)} s · speed{' '}
              {result.averageTrackSpeed.toFixed(4)}→{result.endSpeed.toFixed(4)} ·
              lap speeds [{result.speedTrendByLap.map((speed) => speed.toFixed(3)).join(', ')}]
            </span>
          ))}
          {part3OuterLaneSpinReport.results.map((result) => (
            <span key={`${result.id}-safety`}>
              {result.label}: contact {result.continuousTrackContact ? 'continuous' : 'interrupted'} ·
              roll/slide {result.rollingOrSlidingCoherent ? 'coherent' : 'invalid'} ·
              inward transition {result.naturalInwardTransition ? 'natural' : 'not observed'} @ r{' '}
              {result.inwardTransitionRadius?.toFixed(4) ?? '—'} / t{' '}
              {result.inwardTransitionTime?.toFixed(3) ?? '—'} s ·
              rim/edge clearance {result.minimumRimClearance.toFixed(4)} /{' '}
              {result.minimumDeflectorClearance.toFixed(4)} ·
              pen/sep {result.maxPenetration.toFixed(4)} / {result.maxSeparation.toFixed(4)} ·
              hover {result.hover ? 'yes' : 'no'} · clipping {result.clipping ? 'yes' : 'no'} ·
              tunneling {result.tunneling ? 'yes' : 'no'} · escape {result.escaped ? 'yes' : 'no'} ·
              velocity spike {result.velocitySpike ? 'yes' : 'no'} · artificial acceleration{' '}
              {result.artificialAcceleration ? 'yes' : 'no'} · ball/rotor sync{' '}
              {result.maxVisualBodySyncError.toFixed(6)} / {result.maxRotorSyncError.toFixed(6)} ·{' '}
              {result.detail}
            </span>
          ))}
        </>
      ) : (
        'Waiting for the three PART 2 real dark side-track smoke spins.'
      )}
    </div>
  );

  const renderPart3GeometryDiagnosticReport = () => {
    const profileRows =
      part3GeometryDiagnosticReport?.radialProfile
        .filter(
          (sample) =>
            sample.azimuth ===
              part3GeometryDiagnosticReport.radialProfile[0]?.azimuth &&
            sample.radius >= 1.0 &&
            sample.radius <= 2.6,
        )
        .map(
          (sample) =>
            `${sample.radius.toFixed(2)}:[${sample.hits
              .map(
                (hit) =>
                  `${hit.y.toFixed(4)} ${hit.objectName}/${hit.materialName} n${hit.normalY.toFixed(2)}`,
              )
              .join('|')}]`,
        ) ?? [];
    return (
      <div
        className="part2-drop-report"
        data-testid="part3-geometry-diagnostic-report"
        data-status={part3GeometryDiagnosticReport?.status ?? 'waiting'}
        aria-live="polite"
      >
        {part3GeometryDiagnosticReport ? (
          <>
            <strong>{part3GeometryDiagnosticReport.detail}</strong>
            <span>
              measured dark track r{' '}
              {part3GeometryDiagnosticReport.trueDarkTrackInnerRadius?.toFixed(
                4,
              ) ?? '—'}
              –
              {part3GeometryDiagnosticReport.trueDarkTrackOuterRadius?.toFixed(
                4,
              ) ?? '—'} · center r{' '}
              {part3GeometryDiagnosticReport.trueDarkTrackCenterRadius?.toFixed(
                4,
              ) ?? '—'} · surface Y{' '}
              {part3GeometryDiagnosticReport.darkTrackSurfaceYRange
                ? `${part3GeometryDiagnosticReport.darkTrackSurfaceYRange[0].toFixed(4)}–${part3GeometryDiagnosticReport.darkTrackSurfaceYRange[1].toFixed(4)}`
                : '—'}
            </span>
            <span>
              outer wood r{' '}
              {part3GeometryDiagnosticReport.outerWoodRingRadiusBand
                ? `${part3GeometryDiagnosticReport.outerWoodRingRadiusBand[0].toFixed(4)}–${part3GeometryDiagnosticReport.outerWoodRingRadiusBand[1].toFixed(4)}`
                : '—'}{' '}
              · nearest deflector r{' '}
              {part3GeometryDiagnosticReport.nearestDeflectorRadiusBand
                ? `${part3GeometryDiagnosticReport.nearestDeflectorRadiusBand[0].toFixed(4)}–${part3GeometryDiagnosticReport.nearestDeflectorRadiusBand[1].toFixed(4)}`
                : '—'}
            </span>
            <span>
              visible deflectors{' '}
              {part3GeometryDiagnosticReport.visibleDeflectorCount ?? '—'} ·
              audit{' '}
              {part3GeometryDiagnosticReport.visibleDeflectorAuditPassed
                ? 'PASS'
                : 'FAIL'}{' '}
              · angles{' '}
              {part3GeometryDiagnosticReport.visibleDeflectorAnglesDegrees.length
                ? part3GeometryDiagnosticReport.visibleDeflectorAnglesDegrees
                    .map((angle) => `${angle.toFixed(1)}°`)
                    .join(', ')
                : '—'}
            </span>
            <span>
              proposed launch r{' '}
              {part3GeometryDiagnosticReport.proposedLaunchRadius?.toFixed(
                4,
              ) ?? '—'}{' '}
              / Y{' '}
              {part3GeometryDiagnosticReport.proposedLaunchHeight?.toFixed(
                4,
              ) ?? '—'} · wood clearance{' '}
              {part3GeometryDiagnosticReport.rimClearance?.toFixed(4) ?? '—'}{' '}
              · deflector clearance{' '}
              {part3GeometryDiagnosticReport.deflectorClearance?.toFixed(
                4,
              ) ?? '—'}{' '}
              · contact{' '}
              {part3GeometryDiagnosticReport.staticVisibleContact
                ? 'yes'
                : 'no'}{' '}
              · dark track{' '}
              {part3GeometryDiagnosticReport.staticOnDarkTrack ? 'yes' : 'no'}{' '}
              · wood{' '}
              {part3GeometryDiagnosticReport.staticOnWood ? 'yes' : 'no'} ·
              hover {part3GeometryDiagnosticReport.staticHover ? 'yes' : 'no'}
            </span>
            <code>{profileRows.join(' · ')}</code>
          </>
        ) : (
          'Waiting for the transformed GLB geometry diagnostic.'
        )}
      </div>
    );
  };

  const renderPart4Report = () => (
    <div
      className="part2-drop-report"
      data-testid="part4-validation-report"
      data-status={part4Report?.status ?? 'waiting'}
      aria-live="polite"
    >
      {part4Report ? (
        <>
          <strong>{part4Report.detail}</strong>
          <span>
            kinematic rotor {part4Report.kinematicRotor ? 'enabled' : 'disabled'} · CCD {part4Report.ccdEnabled ? 'enabled' : 'disabled'} ·
            rotor ω {TEST_ANGULAR_SPEED.toFixed(4)} rad/s · 37-pocket colliders active
          </span>
          {part4Report.results.map((result) => (
            <span key={result.id}>
              {result.label}: {result.outcome.toUpperCase()} · contact {result.contactDuration.toFixed(4)} s ·
              spawn r {result.spawnRadius.toFixed(4)} / y {result.spawnHeight.toFixed(4)} ·
              v {result.initialVelocity.x.toFixed(4)}, {result.initialVelocity.y.toFixed(4)}, {result.initialVelocity.z.toFixed(4)} ·
              peak {result.peakSpeed.toFixed(4)} · energy gain {result.maxEnergyGain.toFixed(4)} ·
              r {result.minRadius.toFixed(4)}–{result.maxRadius.toFixed(4)}
            </span>
          ))}
          {part4Report.results.map((result) => (
            <span key={`${result.id}-safety`}>
              {result.label}: pen {result.maxPenetration.toFixed(4)} · sep {result.maxSeparation.toFixed(4)} ·
              escape {result.escaped ? 'yes' : 'no'} · tunneling {result.tunneling ? 'yes' : 'no'} ·
              velocity spike {result.velocityExplosion ? 'yes' : 'no'} · ball sync {result.maxVisualBodySyncError.toFixed(6)} ·
              rotor sync {result.maxRotorSyncError.toFixed(6)} · outside/turret static {result.outsideTurretStationary ? 'yes' : 'no'} ·
              {result.detail}
            </span>
          ))}
        </>
      ) : (
        'Waiting for PART 4 kinematic-rotor probes.'
      )}
    </div>
  );

  const renderPocketReport = () => (
    <div
      className="part2-drop-report"
      data-testid="pocket-validation-report"
      data-status={pocketReport?.status ?? 'waiting'}
      aria-live="polite"
    >
      {pocketReport ? (
        <>
          <strong>{pocketReport.detail}</strong>
          {pocketReport.results
            .filter(
              (result) =>
                result.kind === 'side-track' &&
                result.surfacePoint &&
                result.surfaceNormal,
            )
            .map((result) => (
              <strong key={`${result.id}-alignment-summary`}>
                {result.label} alignment · sample r {result.sampleRadius?.toFixed(4) ?? '—'} ·
                surface ({result.surfacePoint!.x.toFixed(4)}, {result.surfacePoint!.y.toFixed(4)}, {result.surfacePoint!.z.toFixed(4)}) ·
                normal ({result.surfaceNormal!.x.toFixed(4)}, {result.surfaceNormal!.y.toFixed(4)}, {result.surfaceNormal!.z.toFixed(4)}) ·
                ball center ({result.ballCenterPosition.x.toFixed(4)}, {result.ballCenterPosition.y.toFixed(4)}, {result.ballCenterPosition.z.toFixed(4)})
              </strong>
            ))}
          <span>
            European single-zero sequence · 37 pockets · pitch {THREE.MathUtils.radToDeg(POCKET_STEP_RADIANS).toFixed(6)}° ·
            continuous floor r {POCKET_FLOOR_INNER_RADIUS.toFixed(2)}–{POCKET_FLOOR_OUTER_RADIUS.toFixed(2)} ·
            37 frets · phase-locked rotor ω 0.0000 rad/s
          </span>
          {pocketReport.results.map((result) => (
              <span key={result.id}>
                {result.label}: {result.detail} · {result.kind} · target {result.targetPocketNumber ?? '—'} / index {result.targetPocketIndex ?? '—'} ·
                final {result.finalPocketNumber ?? '—'} · peak {result.peakBallSpeed.toFixed(4)} ·
                pen {result.maxPenetration.toFixed(4)} · sep {result.maxSeparation.toFixed(4)} ·
                contact {result.physicalContact ? result.contactColliderType ?? 'yes' : 'no'} ·
                fret {result.fretContact ? 'yes' : 'no'} · escape {result.escaped ? 'yes' : 'no'} ·
                tunnel {result.tunneled ? 'yes' : 'no'} · energy injection {result.artificialEnergyInjection ? 'yes' : 'no'} ·
                rotor sync {result.maxRotorSyncError.toFixed(6)}
              </span>
          ))}
            {pocketReport.results
              .filter(
                (result) =>
                  result.kind === 'side-track' &&
                  result.surfacePoint &&
                  result.surfaceNormal,
              )
              .map((result) => (
                <span key={`${result.id}-alignment`}>
                  {result.label} alignment: sample r {result.sampleRadius?.toFixed(4) ?? '—'} ·
                  surface ({result.surfacePoint!.x.toFixed(4)}, {result.surfacePoint!.y.toFixed(4)}, {result.surfacePoint!.z.toFixed(4)}) ·
                  normal ({result.surfaceNormal!.x.toFixed(4)}, {result.surfaceNormal!.y.toFixed(4)}, {result.surfaceNormal!.z.toFixed(4)}) ·
                  ball center ({result.ballCenterPosition.x.toFixed(4)}, {result.ballCenterPosition.y.toFixed(4)}, {result.ballCenterPosition.z.toFixed(4)}) ·
                  real dark side-track / wood-top fallback no
                </span>
              ))}
        </>
      ) : (
        'Waiting for the three PART 1 authoritative-world probes.'
      )}
    </div>
  );

  return (
    <div ref={stageRef} className="scene-stage" data-testid="canvas-viewport">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label={
          validationMode === 'part4'
            ? 'Part 4 kinematic rotor interaction preview'
            : validationMode === 'part3'
              ? 'Part 3 dynamic ball validation preview'
              : 'Part 2 roulette collider alignment preview'
        }
      />
      <div className="scene-corner scene-corner-tl" aria-hidden="true" />
      <div className="scene-corner scene-corner-br" aria-hidden="true" />
      <div className="viewport-readout" aria-hidden="true">
        <span>
          {validationMode === 'part4'
            ? 'PART 4 · KINEMATIC ROTOR INTERACTION'
            : part6FullSpinRouteActive
              ? 'PART 6B · FULL-SPIN CALIBRATION'
              : validationMode === 'part3'
                ? 'PART 3 · DYNAMIC BALL VALIDATION'
                : 'PART 2 · ZERO-VELOCITY CONTACT'}
        </span>
        <span>ANGLE {THREE.MathUtils.radToDeg(angleReadout).toFixed(2)}° · PIVOT [0, 0, 0] · Y+</span>
        <span>
          {part1ProbeOnly
            ? `PART 1 PROBES ${pocketReport?.status.toUpperCase() ?? 'WAITING'} · AUTHORITATIVE WORLD · CCD`
            : validationMode === 'part4'
            ? `PROBES ${part4Report?.status.toUpperCase() ?? 'WAITING'} · KINEMATIC ROTOR · CCD`
            : validationMode === 'part3'
              ? outerLaneOnly
                ? `PART B OUTER LANE ${part3OuterLaneReport?.status.toUpperCase() ?? 'WAITING'} · TANGENTIAL LAUNCH · CCD`
                : outerLaneSpinOnly
                  ? `PART 6B ROUTE · 6A.1 TELEMETRY ${part6TelemetryReport?.status.toUpperCase() ?? 'WAITING'} · 20 DETERMINISTIC FULL SPINS · CCD`
                : geometryDiagnosticOnly
                  ? `GEOMETRY DIAGNOSTIC ${part3GeometryDiagnosticReport?.status.toUpperCase() ?? 'WAITING'} · STATIC CONTACT`
                : alignmentOnly
                ? `ALIGNMENT ${part3AlignmentReport?.status.toUpperCase() ?? 'WAITING'} · RAPIER CONTACT · CCD`
                : `PROBES ${part3Report?.status.toUpperCase() ?? 'WAITING'} · STATIC COLLIDER · CCD`
              : `DROP ${dropReport?.status.toUpperCase() ?? 'WAITING'} · CCD · 120 HZ`}
        </span>
      </div>
      {part1ProbeOnly ? (
        renderPocketReport()
      ) : validationMode === 'part4' ? (
        <>
          {renderPart4Report()}
          {renderPocketReport()}
        </>
      ) : validationMode === 'part3' ? (
        geometryDiagnosticOnly
          ? renderPart3GeometryDiagnosticReport()
          : outerLaneOnly
          ? renderPart3OuterLaneReport()
          : outerLaneSpinOnly
            ? <>
                {renderPart2RacePlacementReport()}
                {renderPart6TelemetryReport()}
              </>
          : alignmentOnly
            ? renderPart3AlignmentReport()
            : renderPart3Report()
      ) : (
        <div
          className="part2-drop-report"
          data-testid="part2-drop-report"
          data-status={dropReport?.status ?? 'waiting'}
          data-first-contact={dropReport?.firstContactPosition ? 'yes' : 'no'}
          data-pass-through={dropReport?.passThrough ? 'yes' : 'no'}
          data-visible-surface-match={dropReport?.visibleSurfaceMatch ? 'yes' : 'no'}
          aria-live="polite"
        >
          {dropReport ? (
            <>
              <strong>{dropReport.detail}</strong>
              <span>
                contact {dropReport.firstContactPosition ? 'yes' : 'no'} · final speed {dropReport.finalSpeed.toFixed(4)} ·
                max penetration {dropReport.maxPenetration.toFixed(4)} · separation {dropReport.finalSeparation.toFixed(4)}
              </span>
              <span>
                pass-through {dropReport.passThrough ? 'yes' : 'no'} · visible match {dropReport.visibleSurfaceMatch ? 'yes' : 'no'} ·
                contact radius {dropReport.firstContactRadius?.toFixed(4) ?? '—'} ·
                contact time {dropReport.firstContactTime?.toFixed(4) ?? '—'} s
              </span>
              <span>
                first {dropReport.firstContactPosition ? `${dropReport.firstContactPosition.x.toFixed(4)}, ${dropReport.firstContactPosition.y.toFixed(4)}, ${dropReport.firstContactPosition.z.toFixed(4)}` : '—'} ·
                final {dropReport.finalPosition.x.toFixed(4)}, {dropReport.finalPosition.y.toFixed(4)}, {dropReport.finalPosition.z.toFixed(4)}
              </span>
              <span>
                CCD {dropReport.ccdEnabled ? 'enabled' : 'disabled'} · visual/body sync error {dropReport.maxVisualBodySyncError.toFixed(6)}
              </span>
            </>
          ) : (
            'Waiting for one controlled drop.'
          )}
        </div>
      )}
    </div>
  );
}