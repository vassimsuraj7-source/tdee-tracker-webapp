# Requirements Document

## Introduction

TDEETracker Webapp is the successor to the existing native iOS TDEETracker app. The native app's biggest limitation is that it is sideloaded via a free Apple Developer account, so its code-signing certificate expires every 7 days and requires a rebuild-and-reinstall from Xcode, making it impractical for long-term use. This feature replaces the native app with a web-based system that preserves the full feature set of the native app while removing the certificate-expiry problem.

The system:

- Receives daily health data (weight, body fat percentage, step count, and nutrition: calories, protein, carbs, fat, fiber) that already flows from a Mi Body Scale and Cronometer into Apple Health, via an automated export bridge (e.g. Health Auto Export or Apple Shortcuts) that POSTs a JSON payload to a backend endpoint on a twice-daily schedule.
- Persists the received data, along with manually entered corrections and the user's profile and goals, in a durable backend data store.
- Recalculates Total Daily Energy Expenditure (TDEE) server-side using the same three-tier approach as the native app: (1) a data-driven MacroFactor-style rolling-window calculation as the primary method, (2) missing-data imputation and 7-day trend-weight smoothing, and (3) a Mifflin-St Jeor BMR × activity-level estimate as a bootstrap/fallback when there is not yet enough logged data.
- Derives an actionable **daily calorie target** each morning from the current TDEE and the user's weight goal, constrained by BMI-tiered healthy weight-change rates so that it never recommends an unsafe (crash-diet) intake.
- Presents a webapp dashboard mirroring the native app's feature set: at-a-glance summary cards, per-metric historical trend charts (raw values, moving averages, deviation lines, goal lines), a macro/calorie composition chart, TDEE insights, and sequential goal tracking (an overarching main goal plus ordered subgoal milestones).

The accepted tradeoff is that data freshness is bounded by the export automation's schedule (twice per day) rather than real-time HealthKit reactivity. This is acceptable because the TDEE signal itself is a 12-day rolling window and does not benefit from sub-daily updates.

### Single-user constraint

This is strictly a **single-user, personal application**. There is exactly one account (the account owner). Consequently: (a) the Data_Store does not partition records by user and no per-record user-scoping is required; (b) there is no self-service registration or signup flow — the single set of credentials (both the Webapp login and the Ingestion_API key) is configured at deploy time via environment variables / secrets, not created through the app; and (c) multi-tenancy, user management, and sharing are explicitly out of scope.

### Scope

In scope (ported from the native app): health-data ingestion, manual data entry and correction, user profile and demographics, the three-tier TDEE calculation (rolling-window, imputation/trend-weight, and BMR-based estimate/bootstrap), BMI-tiered healthy weight-change guardrails, ideal-weight suggestion and automatic target-date calculation, goal-based daily calorie target, main-goal and sequential-subgoal tracking, dashboard summary cards, per-metric trend charts, nutrition macro/calorie composition (including derived alcohol calories), and TDEE history.

Out of scope: Cronometer CSV import (data now flows via Apple Health and the export bridge), any native companion/exporter app (rejected because it reintroduces the certificate-expiry problem), multi-user support, and self-service account registration.

Documented future work (planned in the native app, not implemented, and not part of this feature): visual progress tracking via weekly transformation photos, and social/sharing features.

## Glossary

- **Webapp_Backend**: The server-side application that exposes the Ingestion_API and Webapp_API, runs the TDEE_Engine and Daily_Recompute, and reads from and writes to the Data_Store.
- **Ingestion_API**: The backend HTTP endpoint that receives a Health_Payload from the Export_Bridge and writes its contents to the Data_Store.
- **Export_Bridge**: The external automation (e.g. Health Auto Export app or an Apple Shortcuts automation) running on the user's device that reads data from Apple Health and sends it to the Ingestion_API. The Export_Bridge is external to this system; this spec covers only the receiving side.
- **Health_Payload**: A JSON document sent by the Export_Bridge to the Ingestion_API, containing one or more daily entries for weight, body fat percentage, step count, and/or nutrition.
- **Webapp_Frontend**: The browser-based, installable (PWA) client application that renders the dashboard, metric detail views, and goal tracking views.
- **Webapp_API**: The backend HTTP endpoints used by the Webapp_Frontend to read and write data on behalf of an authenticated user (distinct from the Ingestion_API, which is used by the Export_Bridge).
- **Data_Store**: The persistent database (e.g. Postgres/Supabase or SQLite) that stores Weight_Entry, Body_Fat_Entry, Step_Count_Entry, Calorie_Entry, User_Profile, User_Goal, and TDEE_Record data.
- **Weight_Entry**: A record of body weight for a specific Entry_Date, in kilograms.
- **Body_Fat_Entry**: A record of body fat percentage for a specific Entry_Date, stored as a decimal fraction (e.g. 0.15 for 15%).
- **Step_Count_Entry**: A record of total step count for a specific Entry_Date.
- **Calorie_Entry**: A record of daily nutrition totals (calories, and optionally protein, carbs, fat, fiber) for a specific Entry_Date.
- **Entry_Date**: The calendar date (normalized to the start of day in the user's configured time zone) that a Weight_Entry, Body_Fat_Entry, Step_Count_Entry, or Calorie_Entry applies to.
- **User_Profile**: The single stored record of the account owner's personal data: name, date of birth (from which age is derived), height, gender, Activity_Level, and an optional stored Calorie_Goal.
- **Activity_Level**: The user's selected physical-activity level, mapped to a standard Physical Activity Level (PAL) multiplier (Sedentary 1.2, Lightly Active 1.375, Moderately Active 1.55, Very Active 1.725, Extremely Active 1.9).
- **BMR**: Basal Metabolic Rate, calculated via the Mifflin-St Jeor equation from weight, height, age, and gender.
- **Estimated_TDEE**: A TDEE approximation computed as BMR × the Activity_Level PAL multiplier, used as a bootstrap/fallback when the data-driven calculation cannot run.
- **Valid_Calorie_Day**: An Entry_Date for which a Calorie_Entry exists with a calorie value greater than zero.
- **Rolling_Window**: A contiguous span of 12 calendar days ending on a given Entry_Date, used as the unit of data-driven TDEE calculation.
- **TDEE_Engine**: The backend component that computes Trend_Weight values and TDEE values from stored Weight_Entry and Calorie_Entry records, including the Estimated_TDEE fallback.
- **Trend_Weight**: The 7-day simple moving average of weight (using imputed/filled daily weight values) ending on a given Entry_Date.
- **TDEE_Record**: A calculated TDEE value stored in the Data_Store for a specific Rolling_Window, together with the window's start and end Entry_Date.
- **User_Goal**: A stored target for a health metric (weight, body fat percentage, or step count), identified as either the Main_Goal or a Subgoal.
- **Main_Goal**: The single User_Goal per metric type that represents the user's ultimate target, identified by an order index of -1.
- **Subgoal**: A User_Goal representing an intermediate milestone toward the Main_Goal, identified by a positive integer order index that determines its sequence.
- **Ideal_Weight**: A suggested healthy target weight derived from height (BMI 21.7 midpoint) and gender (a +5% adjustment for males), rounded to the nearest 0.5 kg.
- **Weight_Change_Rate**: The healthy weekly rate of weight change permitted for the user, determined by their BMI category (see Requirement 10).
- **Calorie_Target**: A recommended daily calorie intake derived from the current TDEE (or Estimated_TDEE) and the active weight Main_Goal, constrained by the Weight_Change_Rate, representing how much the user should eat per day to progress toward the goal safely.
- **Macro_Breakdown**: The decomposition of a Calorie_Entry's total calories into calories from fat (grams × 9), protein (grams × 4), carbs (grams × 4), and derived alcohol.
- **Alcohol_Calories**: Calories attributed to alcohol, derived as total calories minus the sum of fat, protein, and carb calories, retained only when the result is positive and within a plausible bound.
- **Moving_Average**: A smoothed trend line for a metric, computed as a simple moving average over a fixed day window (7 days for the dashboard summary and weight/body-fat trend).
- **Time_Range**: A user-selectable span (e.g. 7 days, 30 days, 90 days, All Time) used to filter the data shown in a metric detail view.
- **Daily_Recompute**: The scheduled backend process that, after the day's data is expected to be synced, recalculates TDEE_Records and the Calorie_Target so the dashboard is current the following morning.
- **Sync_Window**: One of the two scheduled times per day at which the Export_Bridge is expected to submit a Health_Payload. The later of the two occurs before local midnight, ensuring the current day's data is complete before the day rolls over.
- **Sync_Timestamp**: The date and time the Webapp_Backend most recently accepted a Health_Payload from the Ingestion_API.
- **Auth_Service**: The component responsible for authenticating requests to the Ingestion_API (via a shared secret/API key) and authenticating user sessions for the Webapp_API and Webapp_Frontend.
- **TLS**: Transport Layer Security; encryption applied to all network traffic between the Export_Bridge, Webapp_Frontend, and Webapp_Backend.

## Requirements

### Requirement 1: Ingestion API Authentication

**User Story:** As the account owner, I want the data ingestion endpoint to reject requests that do not carry a valid credential, so that only my own Export_Bridge automation can write health data into my account.

#### Acceptance Criteria

1. WHEN the Ingestion_API receives a request that includes a valid API key, THE Ingestion_API SHALL accept the request for further processing.
2. IF the Ingestion_API receives a request that omits an API key or includes an API key that does not match a configured value, THEN THE Ingestion_API SHALL reject the request with an HTTP 401 response and SHALL NOT write any data to the Data_Store.
3. THE Auth_Service SHALL store API keys in a form that is not reversible to the original key value (e.g. a salted hash).
4. WHEN an API key is rejected under Acceptance Criterion 2, THE Ingestion_API SHALL record the rejected attempt's timestamp and source IP address in an access log.

### Requirement 2: Health Payload Ingestion

**User Story:** As the account owner, I want my Export_Bridge automation to submit daily weight, body fat, step count, and nutrition data to a single endpoint, so that data already flowing into Apple Health reaches my webapp without a native companion app.

#### Acceptance Criteria

1. WHEN the Ingestion_API receives an authenticated Health_Payload containing a weight value and an Entry_Date, THE Ingestion_API SHALL create or update a Weight_Entry for that Entry_Date in the Data_Store.
2. WHEN the Ingestion_API receives an authenticated Health_Payload containing a body fat percentage value and an Entry_Date, THE Ingestion_API SHALL create or update a Body_Fat_Entry for that Entry_Date in the Data_Store.
3. WHEN the Ingestion_API receives an authenticated Health_Payload containing a step count value and an Entry_Date, THE Ingestion_API SHALL create or update a Step_Count_Entry for that Entry_Date in the Data_Store.
4. WHEN the Ingestion_API receives an authenticated Health_Payload containing nutrition values (calories, and optionally protein, carbs, fat, fiber) and an Entry_Date, THE Ingestion_API SHALL create or update a Calorie_Entry for that Entry_Date in the Data_Store.
5. WHEN the Ingestion_API receives an authenticated Health_Payload containing entries for more than one Entry_Date, THE Ingestion_API SHALL process each Entry_Date's data independently, so that a failure on one Entry_Date does not prevent valid entries for other Entry_Dates from being stored.
6. WHEN the Ingestion_API successfully processes a Health_Payload, THE Ingestion_API SHALL update the Sync_Timestamp and SHALL return an HTTP 200 response listing the Entry_Dates that were created or updated.

### Requirement 3: Ingestion Idempotency

**User Story:** As the account owner, I want repeated or re-sent exports for the same day to overwrite rather than duplicate that day's data, so that scheduled automation retries do not corrupt my history.

#### Acceptance Criteria

1. WHEN the Ingestion_API receives a Weight_Entry, Body_Fat_Entry, Step_Count_Entry, or Calorie_Entry for an Entry_Date that already has a stored record of the same type, THE Ingestion_API SHALL overwrite the existing record's values rather than creating an additional record.
2. FOR ALL sequences of repeated Health_Payload submissions containing identical data for the same Entry_Date, THE Data_Store SHALL contain exactly one record per entry type per Entry_Date after processing (idempotence property).

### Requirement 4: Payload Validation

**User Story:** As the account owner, I want malformed or out-of-range export data to be rejected with a clear reason, so that bad automation output does not silently corrupt my TDEE history.

#### Acceptance Criteria

1. IF a Health_Payload entry is missing a required Entry_Date field, THEN THE Ingestion_API SHALL reject that entry with an HTTP 400 response identifying the missing field, and SHALL NOT write that entry to the Data_Store.
2. IF a Health_Payload entry contains a weight, body fat percentage, step count, or calorie value that is negative or non-numeric, THEN THE Ingestion_API SHALL reject that entry with an HTTP 400 response identifying the invalid field, and SHALL NOT write that entry to the Data_Store.
3. IF a Health_Payload entry contains an Entry_Date more than 1 day in the future relative to the Webapp_Backend's current date, THEN THE Ingestion_API SHALL reject that entry with an HTTP 400 response, and SHALL NOT write that entry to the Data_Store.
4. WHEN the Ingestion_API rejects one or more entries within a Health_Payload under Acceptance Criteria 1-3, THE Ingestion_API SHALL still process and store the remaining valid entries in that same Health_Payload.

### Requirement 5: Twice-Daily Sync Cadence and Midnight Completeness

**User Story:** As the account owner, I want my data synced twice a day with the day's data guaranteed complete before midnight, so that the next morning's dashboard and calorie target reflect a full, accurate day.

#### Acceptance Criteria

1. THE Ingestion_API SHALL accept a Health_Payload at any time, and SHALL NOT reject a submission on the basis of the time of day it is received.
2. THE Webapp_Backend SHALL expect two Sync_Windows per day, the later of which occurs before local midnight in the user's configured time zone.
3. WHEN the Webapp_Backend has not accepted any Health_Payload for the current local day by the end of the final Sync_Window, THE Webapp_Frontend SHALL indicate on the dashboard that the current day's data may be incomplete.
4. WHEN the final Sync_Window for a local day has passed and a Health_Payload for that day has been accepted, THE Daily_Recompute SHALL run for that day so that updated TDEE_Records and the Calorie_Target are available before the following morning.
5. THE Daily_Recompute SHALL be idempotent, such that running it more than once for the same local day produces the same stored TDEE_Records and Calorie_Target as running it once.

### Requirement 6: Manual Data Entry and Correction

**User Story:** As the account owner, I want to manually add, edit, and delete weight, body fat, step count, and calorie entries in the webapp, so that I retain the same data-correction control the native app provided.

#### Acceptance Criteria

1. WHEN an authenticated user submits a new Weight_Entry, Body_Fat_Entry, Step_Count_Entry, or Calorie_Entry with a valid Entry_Date and value through the Webapp_API, THE Webapp_Backend SHALL create the record in the Data_Store.
2. WHEN an authenticated user submits an edit to an existing entry's value through the Webapp_API, THE Webapp_Backend SHALL update the stored record and SHALL preserve its original Entry_Date unless the user explicitly changes it.
3. WHEN an authenticated user requests deletion of an existing entry through the Webapp_API, THE Webapp_Backend SHALL remove that record from the Data_Store.
4. IF a manual entry submission contains a negative or non-numeric value, THEN THE Webapp_Backend SHALL reject the submission with a validation error and SHALL NOT modify the Data_Store.
5. WHEN a Weight_Entry or Calorie_Entry is created, updated, or deleted through manual entry, THE TDEE_Engine SHALL treat the change as available input for the next Daily_Recompute or an on-demand recompute.

### Requirement 7: User Profile and Demographics

**User Story:** As the account owner, I want to store my name, date of birth, height, gender, and activity level, so that the app can calculate my BMR, estimated TDEE, ideal weight, and healthy weight-change rates.

#### Acceptance Criteria

1. WHEN an authenticated user submits profile data (name, date of birth, height, gender, Activity_Level) through the Webapp_API, THE Webapp_Backend SHALL create or update the single User_Profile record in the Data_Store.
2. THE Webapp_Backend SHALL derive the user's age from the stored date of birth relative to the current date, rather than storing a static age value.
3. WHERE the user has not selected an Activity_Level, THE Webapp_Backend SHALL default the Activity_Level to Moderately Active (PAL 1.55).
4. IF profile data required for a downstream calculation (date of birth, height, or gender) is missing when that calculation is requested, THEN THE Webapp_Backend SHALL surface a clear error indicating which profile field is missing rather than producing an invalid result.
5. WHEN an authenticated user views their profile in the Webapp_Frontend, THE Webapp_Frontend SHALL display the stored name, date of birth, height, gender, and Activity_Level, each editable.

### Requirement 8: Main Goal Management

**User Story:** As the account owner, I want to set a single overarching target for weight, body fat, or steps, so that I have a clear long-term objective to track against.

#### Acceptance Criteria

1. WHEN an authenticated user creates a Main_Goal for a metric type through the Webapp_API, THE Webapp_Backend SHALL store a User_Goal with an order index of -1 for that metric type, recording the user's current value for that metric at the time the goal is set.
2. IF a Main_Goal already exists for a metric type and an authenticated user creates another Main_Goal for that same metric type, THEN THE Webapp_Backend SHALL replace the existing Main_Goal rather than storing a second Main_Goal for that metric type.
3. WHEN an authenticated user updates or deletes a Main_Goal through the Webapp_API, THE Webapp_Backend SHALL persist the change to the corresponding User_Goal record.
4. WHEN an authenticated user views the Goals section of the Webapp_Frontend, THE Webapp_Frontend SHALL display the Main_Goal's target value, target date, and progress relative to the most recent recorded value for that metric.

### Requirement 9: Sequential Subgoal Management

**User Story:** As the account owner, I want to break my main goal into ordered milestone subgoals, so that I can track incremental progress toward a longer-term target.

#### Acceptance Criteria

1. WHEN an authenticated user creates a Subgoal for a metric type through the Webapp_API, THE Webapp_Backend SHALL store a User_Goal with a positive integer order index for that metric type, one greater than the highest existing order index for that metric type.
2. WHEN an authenticated user views the Goals section of the Webapp_Frontend, THE Webapp_Frontend SHALL display all Subgoals for the selected metric type ordered by their order index.
3. WHEN an authenticated user marks a Subgoal as completed through the Webapp_API, THE Webapp_Backend SHALL record a completion date on that Subgoal's User_Goal record.
4. WHEN an authenticated user deletes a Subgoal through the Webapp_API, THE Webapp_Backend SHALL remove that User_Goal record without altering the order index of other Subgoals.

### Requirement 10: Healthy Weight-Change Guardrails

**User Story:** As the account owner, I want the app to suggest a healthy target weight and enforce safe weight-change rates based on my BMI, so that it never guides me into a crash diet or an unsafe target.

#### Acceptance Criteria

1. WHEN the Webapp_Backend suggests an Ideal_Weight, it SHALL derive it from the user's height using a BMI of 21.7, apply a +5% adjustment for male users, and round the result to the nearest 0.5 kg.
2. THE Webapp_Backend SHALL determine the permitted Weight_Change_Rate from the user's current BMI as follows: BMI below 18.5 (underweight) permits weight gain only and no weight loss; BMI 18.5 to below 25 (normal) permits up to 0.25 kg/week loss; BMI 25 to below 30 (overweight) permits up to 0.35 kg/week loss; BMI 30 to below 40 (obese) permits up to 0.5 kg/week loss; BMI 40 or above permits up to 1.0 kg/week loss.
3. WHEN the Webapp_Backend calculates a suggested target date for a weight goal, it SHALL divide the required weight change by the permitted Weight_Change_Rate and SHALL clamp the resulting timeline to a minimum of 2 weeks and a maximum of 52 weeks.
4. IF a user sets a weight-loss goal while their BMI is below 18.5, THEN THE Webapp_Backend SHALL reject or warn against the goal rather than computing a weight-loss calorie target.
5. WHEN any calorie target or goal timeline is computed, THE Webapp_Backend SHALL NOT produce a plan whose implied rate of weight change exceeds the permitted Weight_Change_Rate for the user's BMI category, and WHERE a user-requested target date would require exceeding that rate, THE Webapp_Backend SHALL cap the plan at the permitted rate and flag that the requested date is not achievable at a healthy pace.

### Requirement 11: TDEE Rolling Window Calculation

**User Story:** As the account owner, I want my TDEE calculated the same way the native app calculated it, so that my historical trend continues without a discontinuity when I switch to the webapp.

#### Acceptance Criteria

1. THE TDEE_Engine SHALL define a Rolling_Window as 12 consecutive calendar days.
2. WHEN searching for a calculable Rolling_Window, THE TDEE_Engine SHALL start from the most recent Entry_Date with data and move backward one day at a time until a Rolling_Window with at least 7 Valid_Calorie_Days is found or no calorie data remains.
3. IF a Rolling_Window contains fewer than 7 Valid_Calorie_Days, THEN THE TDEE_Engine SHALL exclude that Rolling_Window from data-driven TDEE calculation and SHALL continue searching earlier windows.
4. WHEN a Rolling_Window has at least 7 Valid_Calorie_Days, THE TDEE_Engine SHALL calculate TDEE for that window using the formula `TDEE = (Total Calories Consumed - (Weight Change kg * 7700 kcal/kg)) / Number of Days`, where Number of Days is 12.
5. THE TDEE_Engine SHALL calculate Weight Change kg for a Rolling_Window as the Trend_Weight on the window's last Entry_Date minus the Trend_Weight on the window's first Entry_Date.
6. IF the Trend_Weight cannot be determined for the first or last Entry_Date of a Rolling_Window, THEN THE TDEE_Engine SHALL exclude that Rolling_Window from data-driven TDEE calculation.

### Requirement 12: Missing Calorie Day Imputation

**User Story:** As the account owner, I want days without a logged nutrition entry to be imputed rather than treated as zero calories, so that a single missed log doesn't distort my TDEE.

#### Acceptance Criteria

1. WHEN a Rolling_Window has at least 7 Valid_Calorie_Days but fewer than 12 Valid_Calorie_Days, THE TDEE_Engine SHALL impute each missing day's calorie value as the arithmetic mean of the Valid_Calorie_Days within that same Rolling_Window.
2. THE TDEE_Engine SHALL calculate Total Calories Consumed for a Rolling_Window as the sum of each day's actual calorie value for Valid_Calorie_Days and imputed calorie value for non-Valid_Calorie_Days, across all 12 days of the window.

### Requirement 13: Trend Weight Calculation

**User Story:** As the account owner, I want weight trend to be smoothed the same way the native app smoothed it, so that day-to-day water-weight fluctuation doesn't distort TDEE or the weight chart.

#### Acceptance Criteria

1. THE TDEE_Engine SHALL calculate Trend_Weight for a given Entry_Date as the arithmetic mean of daily weight values over the 7-day window ending on and including that Entry_Date.
2. WHEN a day within the 7-day Trend_Weight window has no recorded Weight_Entry, THE TDEE_Engine SHALL impute that day's weight value using linear interpolation between the nearest earlier and later recorded Weight_Entry values.
3. IF a day within the 7-day Trend_Weight window has no recorded Weight_Entry and only an earlier or only a later recorded Weight_Entry exists (not both), THEN THE TDEE_Engine SHALL impute that day's weight value using the single nearest available recorded value.
4. IF fewer than 7 days of weight values (actual or imputed) are available to cover the 7-day window ending on an Entry_Date, THEN THE TDEE_Engine SHALL treat the Trend_Weight for that Entry_Date as undetermined.

### Requirement 14: Estimated TDEE Bootstrap and Fallback

**User Story:** As the account owner, I want a reasonable TDEE estimate even before I have enough logged data, so that I get a useful calorie target from day one rather than an empty screen.

#### Acceptance Criteria

1. WHEN no data-driven TDEE_Record can be calculated (per Requirements 11-13) and a User_Profile with the required fields and at least one Weight_Entry exist, THE TDEE_Engine SHALL compute an Estimated_TDEE as BMR × the Activity_Level PAL multiplier, where BMR uses the Mifflin-St Jeor equation with the most recent weight, the profile height, the derived age, and the profile gender.
2. WHEN both a data-driven TDEE_Record and an Estimated_TDEE are available, THE TDEE_Engine SHALL prefer the data-driven TDEE_Record as the current TDEE.
3. WHERE an Estimated_TDEE is used in place of a data-driven TDEE_Record, THE Webapp_Frontend SHALL indicate that the displayed TDEE is an estimate rather than a data-driven value.
4. IF neither a data-driven TDEE nor the profile data required for an Estimated_TDEE is available, THEN THE Webapp_Backend SHALL treat the current TDEE as undetermined and THE Webapp_Frontend SHALL display an explanatory empty state.

### Requirement 15: TDEE Historical Trend Storage

**User Story:** As the account owner, I want to see how my TDEE has changed over time, not just its current value, so that I can spot metabolic adaptation or logging drift.

#### Acceptance Criteria

1. WHEN the TDEE_Engine successfully calculates a data-driven TDEE value for a Rolling_Window, THE Webapp_Backend SHALL store a TDEE_Record containing the calculated value and the window's start and end Entry_Date in the Data_Store.
2. WHEN a TDEE_Record already exists for a Rolling_Window with the same end Entry_Date, THE Webapp_Backend SHALL overwrite the existing TDEE_Record's value rather than creating an additional record.
3. WHEN an authenticated user requests historical TDEE data through the Webapp_API, THE Webapp_Backend SHALL return all stored TDEE_Records ordered by end Entry_Date.

### Requirement 16: Goal-Based Daily Calorie Target

**User Story:** As the account owner, I want each morning to show how many calories I should eat that day to stay on track for my goal, so that I have an actionable target rather than just a TDEE number.

#### Acceptance Criteria

1. WHEN a current TDEE (data-driven or Estimated_TDEE) and an active weight Main_Goal with a target value and target date both exist, THE Webapp_Backend SHALL calculate a Calorie_Target as the current TDEE adjusted by the daily energy deficit or surplus required to move from the most recent Trend_Weight to the Main_Goal's target value by its target date, using 7700 kcal per kilogram of body-weight change.
2. THE Webapp_Backend SHALL constrain the daily adjustment in Acceptance Criterion 1 so that the implied weekly rate of weight change does not exceed the permitted Weight_Change_Rate for the user's BMI category (Requirement 10), capping the Calorie_Target at that rate and flagging when the Main_Goal's target date is therefore not achievable at a healthy pace.
3. THE Webapp_Backend SHALL enforce an absolute floor of 1200 kcal on the Calorie_Target, so that no goal produces a recommendation below that value.
4. IF no active weight Main_Goal exists, THEN THE Webapp_Backend SHALL set the Calorie_Target equal to the current TDEE (maintenance) rather than failing to produce a value.
5. IF no current TDEE value can be determined, THEN THE Webapp_Backend SHALL treat the Calorie_Target as undetermined and THE Webapp_Frontend SHALL display an explanatory empty state rather than a numeric target.
6. WHEN an authenticated user loads the dashboard, THE Webapp_Frontend SHALL display the current Calorie_Target together with the TDEE it was derived from and an indication of whether that TDEE is data-driven or estimated.

### Requirement 17: Dashboard Summary Display

**User Story:** As the account owner, I want a dashboard that shows my latest weight, body fat, steps, calories, TDEE, and calorie target at a glance, so that I can check my status without navigating into detail screens.

#### Acceptance Criteria

1. WHEN an authenticated user loads the Webapp_Frontend dashboard, THE Webapp_Frontend SHALL display a summary card for weight (as a 7-day Moving_Average), body fat (as a 7-day Moving_Average), the most recent Step_Count_Entry, the most recent Calorie_Entry, the current TDEE, and the current Calorie_Target.
2. IF no data exists for a metric, THEN THE Webapp_Frontend SHALL display that metric's summary card in an empty state rather than omitting the card.
3. WHEN an authenticated user selects a summary card, THE Webapp_Frontend SHALL navigate to the corresponding metric's detail view.
4. THE Webapp_Frontend SHALL display the Sync_Timestamp on the dashboard, so the user can see how recent the underlying data is.

### Requirement 18: Metric Detail and Trend Visualization

**User Story:** As the account owner, I want historical charts for each metric with moving averages, deviation lines, and goal lines, so that I get the same trend insight the native app's charts provided.

#### Acceptance Criteria

1. WHEN an authenticated user opens a metric detail view for weight, body fat percentage, or step count, THE Webapp_Frontend SHALL render a chart of that metric's raw historical values for the selected Time_Range.
2. WHEN an authenticated user opens the weight or body fat percentage detail view, THE Webapp_Frontend SHALL render a smoothed Moving_Average trend line alongside the raw data points on the same chart.
3. WHEN an authenticated user opens the weight or body fat percentage detail view and an active User_Goal exists for that metric, THE Webapp_Frontend SHALL render a goal line on the chart representing the User_Goal's target value.
4. WHERE the user has enabled deviation line display, THE Webapp_Frontend SHALL render a line connecting each raw data point to its corresponding trend value, color-coded to indicate the direction of deviation.
5. WHEN an authenticated user changes the selected Time_Range on a metric detail view, THE Webapp_Frontend SHALL update the displayed chart and historical entry list to reflect only entries within the selected Time_Range.
6. WHEN an authenticated user opens the TDEE detail view, THE Webapp_Frontend SHALL display the current TDEE value and a historical chart of past TDEE_Records.
7. WHEN an authenticated user opens a metric detail view, THE Webapp_Frontend SHALL display a list of historical entries for that metric, each with options to edit or delete the entry.

### Requirement 19: Nutrition Macro and Calorie Composition

**User Story:** As the account owner, I want to see my daily calories broken down by macronutrient with my TDEE overlaid, so that I can understand not just how much but what I ate relative to my expenditure.

#### Acceptance Criteria

1. WHEN an authenticated user opens the calorie detail view, THE Webapp_Frontend SHALL render each day's calories as a stacked composition of calories from fat (grams × 9), protein (grams × 4), and carbs (grams × 4) for the selected Time_Range.
2. THE Webapp_Backend SHALL derive Alcohol_Calories for a Calorie_Entry as total calories minus the sum of fat, protein, and carb calories, and SHALL include the derived Alcohol_Calories in the composition only when the derived value is positive and within a plausible upper bound.
3. WHEN a current TDEE value is available, THE Webapp_Frontend SHALL overlay a TDEE reference line on the calorie composition chart.
4. WHEN an authenticated user opens the calorie detail view, THE Webapp_Frontend SHALL exclude days whose total calories are zero from the chart.

### Requirement 20: Webapp User Authentication

**User Story:** As the account owner, I want my dashboard and health data protected behind a login, so that a personal health webapp exposed on the internet isn't readable by anyone who finds the URL.

#### Acceptance Criteria

1. IF a request to the Webapp_API is not accompanied by a valid authenticated session, THEN THE Webapp_Backend SHALL reject the request with an HTTP 401 response and SHALL NOT return or modify health data.
2. WHEN a user submits valid login credentials through the Webapp_Frontend, THE Auth_Service SHALL establish an authenticated session for that user.
3. WHEN a user submits invalid login credentials through the Webapp_Frontend, THE Auth_Service SHALL reject the login attempt without revealing whether the username or password was the invalid component.
4. THE Auth_Service SHALL store user credentials in a form that is not reversible to the original password value (e.g. a salted hash).

### Requirement 21: Installable Web App Experience

**User Story:** As the account owner, I want to install the webapp to my phone's home screen like a native app, so that I get an app-like experience without App Store or certificate friction.

#### Acceptance Criteria

1. THE Webapp_Frontend SHALL be installable as a Progressive Web App, providing a web app manifest and icon set sufficient for home-screen installation on iOS and Android browsers.
2. WHEN the Webapp_Frontend is launched from an installed home-screen icon, THE Webapp_Frontend SHALL display without browser navigation chrome (standalone display mode).
3. WHILE the device has no network connectivity, THE Webapp_Frontend SHALL display the most recently loaded dashboard data along with an indication that the data may be stale, rather than showing a blank error page.

### Requirement 22: Internet-Facing Security Hardening

**User Story:** As the account owner, I want my health data protected now that the app is exposed on the public internet instead of confined to my phone, so that the move off-device does not expose sensitive data.

#### Acceptance Criteria

1. THE Webapp_Backend SHALL serve the Ingestion_API, Webapp_API, and Webapp_Frontend exclusively over TLS, and SHALL redirect or reject any plain-HTTP request rather than serving it.
2. THE Webapp_Backend SHALL load all secrets (Ingestion_API key, Webapp credentials, Data_Store connection credentials) from environment variables or a secrets manager at runtime, and no secret SHALL be committed to source control.
3. THE Ingestion_API and the Webapp_API login endpoint SHALL enforce rate limiting, such that repeated failed authentication attempts from a source are throttled after a configurable threshold.
4. WHEN an authenticated Webapp session exceeds a configurable maximum lifetime, THE Auth_Service SHALL invalidate the session and require re-authentication.
5. WHERE the Webapp_API uses cookie-based sessions, THE Auth_Service SHALL set the session cookie with the Secure and HttpOnly attributes.
6. WHEN the Ingestion_API or Webapp_API rejects a request due to validation or authentication failure, THE Webapp_Backend SHALL return an error message that does not include stack traces, database internals, or the expected credential value.
7. THE Data_Store credentials used by the Webapp_Backend SHALL grant access only to this application's data and SHALL NOT grant broader administrative privileges than the application requires.
