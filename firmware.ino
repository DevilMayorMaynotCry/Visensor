/*
  ============================================================
  VIsensor - FINAL Production Sketch (Zone-Based Beep Pattern)
  Dual TF-Luna obstacle detection with left/right buzzers
  for a wearable obstacle-warning device
  ============================================================

  REQUIRES: both TF-Luna sensors already reconfigured to 9600
  baud - run VIsensor_Step1_OneTime_BaudSetup.ino ONCE first,
  if you haven't already.

  ------------------------------------------------------------
  BEEP PATTERN - per client's latest spec (4 distance zones,
  matching their thesis test points of 2m / 4m / 6m / 8m):
  ------------------------------------------------------------
    ~7-8m  (FAR)   : ONE single pulse, then a long pause,
                     repeating - a sparse "ping" warning that
                     something is there. Side-specific (only
                     the side that detected it beeps).
    ~5-7m  (MID)   : a burst of exactly 5 beeps at a moderate,
                     "not too fast" pace, then a pause before
                     the burst repeats. Side-specific.
    ~3-5m  (NEAR)  : continuous beeping that smoothly speeds
                     up as the object gets closer (from the
                     MID zone's pace down toward the CLOSE
                     zone's pace). Side-specific.
    <=3m   (CLOSE) : very fast continuous beeping. BOTH
                     buzzers sound together here, even if only
                     ONE side's sensor is the one detecting the
                     close object - at this range the client
                     wants a full alert rather than a
                     side-specific one.
    >8m or no valid reading: silent.

  ASSUMPTION FLAGGED #1: the client gave 4 reference distances
  (2/4/6/8m) but not exact zone edges. This code splits zones
  at the midpoint between each pair (7m, 5m, 3m). If testing
  shows a transition feels off, these are single constants to
  move - see the ZONE_..._MAX_CM block below.

  ASSUMPTION FLAGGED #2: "both left and right warning" at 2m
  is implemented as - if EITHER sensor detects something
  within the CLOSE zone, BOTH buzzers switch to the fast CLOSE
  pattern, regardless of what the other sensor itself reads.
  If instead you only want both buzzing when BOTH sensors
  independently detect something close, say so - it's a small
  change in updateBuzzerZone()'s otherSideClose logic.

  WHY digitalWrite() FOR THE BUZZERS, NOT tone():
  The stock Arduino tone() function can only drive ONE pin at a
  time on an ATmega328 (Uno/Nano) - calling it on a second pin
  silently cuts off the first. Since both buzzers need to be
  able to sound together (CLOSE zone), this sketch pulses each
  buzzer pin independently with digitalWrite(), which has no
  such limitation. This assumes ACTIVE buzzers (they sound as
  soon as they get power) - say so if yours are passive piezo
  buzzers instead, since that needs a different approach.

  PIN NOTE: Left buzzer = D4, Right buzzer = D5, per your most
  recent wiring list - double check against the physical device.
  ============================================================
*/

#include <SoftwareSerial.h>

// ---------------- PIN ASSIGNMENTS ----------------
SoftwareSerial leftSensor(2, 3);   // Left TF-Luna:  RX=D2, TX=D3
SoftwareSerial rightSensor(6, 7);  // Right TF-Luna: RX=D6, TX=D7

const int leftBuzzer  = 4;
const int rightBuzzer = 5;

// ---------------- SENSOR SETTINGS ----------------
const unsigned long SENSOR_BAUD = 9600;      // sensors must already be set to this
const unsigned long STALE_TIMEOUT_MS = 400;  // if a sensor gives no valid reading
                                              // for this long, its zone clears to
                                              // NONE instead of staying stuck

// ---------------- ZONE BOUNDARIES (centimeters) ----------------
// Edges sit at the midpoint between the client's 2/4/6/8m test points.
const int ZONE_CLOSE_MAX_CM = 300;  // <=300cm   (<=3m)   -> CLOSE
const int ZONE_NEAR_MAX_CM  = 500;  // 301-500cm (3-5m)   -> NEAR
const int ZONE_MID_MAX_CM   = 700;  // 501-700cm (5-7m)   -> MID
const int ZONE_FAR_MAX_CM   = 800;  // 701-800cm (7-8m)   -> FAR
                                     // >800cm             -> NONE (out of range)

// ---------------- BEEP TIMING PER ZONE ----------------
// FAR: one sparse pulse, long pause, repeat
const unsigned int FAR_PULSE_ON_MS  = 60;
const unsigned int FAR_PULSE_GAP_MS = 1500;

// MID: a burst of exactly 5 beeps at a moderate pace, then a pause
const unsigned int MID_BEEP_ON_MS     = 70;
const unsigned int MID_BEEP_GAP_MS    = 220;
const int          MID_BURST_COUNT    = 5;
const unsigned int MID_BURST_PAUSE_MS = 1200;

// NEAR: continuous beeping, speeding up from the MID pace to the CLOSE pace
const unsigned int NEAR_PULSE_ON_MS  = 50;
const unsigned int NEAR_GAP_AT_5M_MS = 220;  // matches MID's pace at the 5m edge
const unsigned int NEAR_GAP_AT_3M_MS = 80;   // approaching CLOSE's pace at the 3m edge

// CLOSE: very fast continuous beeping
const unsigned int CLOSE_PULSE_ON_MS  = 40;
const unsigned int CLOSE_PULSE_GAP_MS = 40;

// ---------------- ZONE STATE MACHINE ----------------
enum Zone { ZONE_NONE, ZONE_FAR, ZONE_MID, ZONE_NEAR, ZONE_CLOSE };

Zone classifyZone(int distanceCm) {
  if (distanceCm <= 0)                 return ZONE_NONE;
  if (distanceCm <= ZONE_CLOSE_MAX_CM) return ZONE_CLOSE;
  if (distanceCm <= ZONE_NEAR_MAX_CM)  return ZONE_NEAR;
  if (distanceCm <= ZONE_MID_MAX_CM)   return ZONE_MID;
  if (distanceCm <= ZONE_FAR_MAX_CM)   return ZONE_FAR;
  return ZONE_NONE; // beyond 8m
}

struct BuzzerChannel {
  int pin;
  Zone zone;
  bool pulseOn;
  unsigned long nextEventAt;
  int burstBeepsDone;
  bool inBurstPause;
  unsigned long lastValidAt;
};

BuzzerChannel left  = { leftBuzzer,  ZONE_NONE, false, 0, 0, false, 0 };
BuzzerChannel right = { rightBuzzer, ZONE_NONE, false, 0, 0, false, 0 };

// Manual prototype - works around a known Arduino IDE bug where its
// auto-generated function prototypes get inserted at the very top of the
// file, before custom structs like BuzzerChannel are defined, causing a
// "was not declared in this scope" error. This line fixes it.
void updateBuzzerZone(BuzzerChannel &ch, int distanceCm, bool otherSideClose);

// ---------------- SENSOR FRAME READING ----------------
// Adapted from Benewake's own official TFmini-Plus/TF-Luna Arduino routine
// (same 9-byte frame + checksum format the TF-Luna uses), with a short
// bounded wait so one bad or missing frame never stalls the loop.
int readDistance(SoftwareSerial &sensor) {
  sensor.listen();

  unsigned long start = millis();
  while (sensor.available() < 9 && millis() - start < 25) {
    // wait briefly for a fresh 9-byte frame (sensor streams ~every 10ms)
  }

  int distance = -1;

  while (sensor.available() >= 9) {
    if (sensor.read() != 0x59) continue;   // resync: scan until header byte 1 found
    if (sensor.peek() != 0x59) continue;   // header byte 2 must follow immediately
    sensor.read();                          // consume confirmed header byte 2

    uint8_t buf[7];
    for (int i = 0; i < 7; i++) buf[i] = sensor.read();

    uint8_t checksum = 0x59 + 0x59;
    for (int i = 0; i < 6; i++) checksum += buf[i];

    if (checksum == buf[6]) {               // matches Benewake's documented checksum
      distance = buf[0] | (buf[1] << 8);    // low byte + high byte, in cm
    }
    break;
  }

  while (sensor.available() > 0) sensor.read();  // drop leftovers before next call

  return distance;
}

// ---------------- BUZZER LOGIC (non-blocking, zone-based) ----------------
void updateBuzzerZone(BuzzerChannel &ch, int distanceCm, bool otherSideClose) {
  unsigned long now = millis();

  Zone rawZone = classifyZone(distanceCm);

  if (rawZone != ZONE_NONE) {
    ch.lastValidAt = now;
  } else if (now - ch.lastValidAt <= STALE_TIMEOUT_MS) {
    rawZone = ch.zone; // brief gap in valid data - hold the previous zone
  } // else: genuinely no reading for a while - stays ZONE_NONE

  // "Both left and right warn" at the closest range: if the OTHER sensor
  // is in the CLOSE zone, this buzzer escalates to CLOSE too, regardless
  // of what this side's own sensor currently reads.
  Zone effectiveZone = otherSideClose ? ZONE_CLOSE : rawZone;

  if (effectiveZone != ch.zone) {
    // entering a different zone - reset the pattern cleanly
    ch.zone = effectiveZone;
    ch.pulseOn = false;
    ch.burstBeepsDone = 0;
    ch.inBurstPause = false;
    ch.nextEventAt = now;
    digitalWrite(ch.pin, LOW);
  }

  if (ch.zone == ZONE_NONE) {
    if (ch.pulseOn) { digitalWrite(ch.pin, LOW); ch.pulseOn = false; }
    return;
  }

  if (now < ch.nextEventAt) return; // not time for the next beep event yet

  switch (ch.zone) {

    case ZONE_FAR:
      if (ch.pulseOn) {
        digitalWrite(ch.pin, LOW);
        ch.pulseOn = false;
        ch.nextEventAt = now + FAR_PULSE_GAP_MS;
      } else {
        digitalWrite(ch.pin, HIGH);
        ch.pulseOn = true;
        ch.nextEventAt = now + FAR_PULSE_ON_MS;
      }
      break;

    case ZONE_MID:
      if (ch.inBurstPause) {
        ch.inBurstPause = false;
        ch.burstBeepsDone = 0;
        digitalWrite(ch.pin, HIGH);
        ch.pulseOn = true;
        ch.nextEventAt = now + MID_BEEP_ON_MS;
      } else if (ch.pulseOn) {
        digitalWrite(ch.pin, LOW);
        ch.pulseOn = false;
        ch.burstBeepsDone++;
        if (ch.burstBeepsDone >= MID_BURST_COUNT) {
          ch.inBurstPause = true;
          ch.nextEventAt = now + MID_BURST_PAUSE_MS;
        } else {
          ch.nextEventAt = now + MID_BEEP_GAP_MS;
        }
      } else {
        digitalWrite(ch.pin, HIGH);
        ch.pulseOn = true;
        ch.nextEventAt = now + MID_BEEP_ON_MS;
      }
      break;

    case ZONE_NEAR: {
      int clamped = constrain(distanceCm, ZONE_CLOSE_MAX_CM, ZONE_NEAR_MAX_CM);
      unsigned int gap = map(clamped, ZONE_CLOSE_MAX_CM, ZONE_NEAR_MAX_CM, NEAR_GAP_AT_3M_MS, NEAR_GAP_AT_5M_MS);
      if (ch.pulseOn) {
        digitalWrite(ch.pin, LOW);
        ch.pulseOn = false;
        ch.nextEventAt = now + gap;
      } else {
        digitalWrite(ch.pin, HIGH);
        ch.pulseOn = true;
        ch.nextEventAt = now + NEAR_PULSE_ON_MS;
      }
      break;
    }

    case ZONE_CLOSE:
      if (ch.pulseOn) {
        digitalWrite(ch.pin, LOW);
        ch.pulseOn = false;
        ch.nextEventAt = now + CLOSE_PULSE_GAP_MS;
      } else {
        digitalWrite(ch.pin, HIGH);
        ch.pulseOn = true;
        ch.nextEventAt = now + CLOSE_PULSE_ON_MS;
      }
      break;

    default:
      break;
  }
}

void setup() {
  Serial.begin(9600);
  leftSensor.begin(SENSOR_BAUD);
  rightSensor.begin(SENSOR_BAUD);

  pinMode(leftBuzzer, OUTPUT);
  pinMode(rightBuzzer, OUTPUT);
  digitalWrite(leftBuzzer, LOW);
  digitalWrite(rightBuzzer, LOW);

  Serial.println("VIsensor ready - zone-based beep pattern - sensors must already be set to 9600 baud.");
}

void loop() {
  int leftDist  = readDistance(leftSensor);
  int rightDist = readDistance(rightSensor);

  bool leftIsClose  = (classifyZone(leftDist)  == ZONE_CLOSE);
  bool rightIsClose = (classifyZone(rightDist) == ZONE_CLOSE);

  updateBuzzerZone(left,  leftDist,  rightIsClose);
  updateBuzzerZone(right, rightDist, leftIsClose);

  Serial.print("L:");
  if (leftDist == -1) Serial.print("--"); else Serial.print(leftDist);
  Serial.print("cm  R:");
  if (rightDist == -1) Serial.print("--"); else Serial.print(rightDist);
  Serial.println("cm");
}
