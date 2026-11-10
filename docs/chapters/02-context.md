## 2. Context {#context}

### Singapore's hospitality landscape {#hospitality-landscape}

Singapore's hotel sector spans three broad segments: **luxury** (for example Raffles, Mandarin Oriental, Shangri-La and The Ritz-Carlton), **mid-range** (for example Novotel, Holiday Inn and Hilton Garden Inn, and serviced-residence brands such as Citadines, Somerset and Oakwood), and **budget** (for example lyf, Hotel 81 and ibis budget). Large groups such as The Ascott Limited operate brands across several of these tiers. The segments differ in guest profile, service expectations, margins and staffing models, so a solution that suits a luxury property is not automatically right for a budget one. This became a recurring consideration in how we framed our eventual prototype.

Despite these differences, every hotel delivers the same core service chain:

| Stage | Core services |
|---|---|
| **Pre-arrival** | Reservations, pre-arrival messaging, deposits and payment |
| **Arrival** | Check-in and ID verification, room and key assignment, luggage and concierge |
| **Stay** | Housekeeping, food and beverage, guest requests |
| **Departure** | Check-out and billing, feedback and reviews, loyalty rewards |

Arrival is the first moment a guest interacts with the hotel in person. It is also the stage that combines the most routine, rule-bound tasks (verifying identity, collecting payment, issuing a key) in a single, time-pressured transaction at the front desk.

### Manpower challenges {#manpower-challenges}

The hotel industry in Singapore faces a persistent shortage of front-line labour, and this is the pressure that most directly shapes interest in self-service technology:

- Hospitality roles are among the **hardest to fill** in Singapore's job vacancy statistics (ranked 4th hardest-to-fill in the figures we reviewed). Job seekers surveyed by the Ministry of Manpower (MOM) most often cited physically strenuous work (42.9%), long hours (39.1%) and unattractive pay (37.4%), while 33.8% preferred not to work shifts, weekends or public holidays.
- Foreign-worker **quotas** limit how far the gap can be filled from overseas, and the **minimum qualifying salary for new S Passes rises to S$3,600 from 1 January 2027**, raising the cost of each hire.
- A large share of staff, around two-thirds in the figures we reviewed, have only **0–1 year of experience**, which makes consistent service and training harder to sustain.

Staffing also comes in discrete units. A hotel cannot hire "0.3 of a person", so a front desk sized for the busiest arrival window is under-used for much of the day, while one sized for the average day is overwhelmed at peak. Peak arrivals, such as an aircrew of 20–30 checking in at once, are a matter of **concurrency rather than total volume**, which is exactly the kind of demand a self-service channel can absorb.

### Regulatory context for check-in {#regulatory-context}

Check-in in Singapore is not only a service step but a **regulated one**. Hotels are required to verify the identity and permitted stay of international visitors. The Singapore Tourism Board (STB) provides the **E-Visitor Authentication (EVA)** system, an API that automates verification of a visitor's stay validity against Immigration and Checkpoints Authority (ICA) records. In an EVA-enabled check-in flow, the passport is scanned and a live face capture is matched against the passport photo. Hotels without EVA must carry out this check manually.

This makes check-in a particularly strong candidate for automation in Singapore: the verification is mandatory, repetitive and rule-based, and it requires a physical presence at the property (a live face capture and a physical key), which means it cannot simply be replaced by a mobile app in the way that, for example, cinema ticketing has been.

### Government and industry push {#digitalisation-push}

Government agencies are actively encouraging digital check-in:

- STB's EVA programme has **24 certified vendors** (as of September 2026), and hotels representing over **70% of Singapore's room stock** have connected their check-in and check-out processes to EVA.
- The **STB and IMDA Hotel Industry Digital Plan** sets out digital solutions for hotels, including smart rooms, digital concierge, digital check-in/check-out, asset management systems and robotics.
- Funding support, such as the **STB Business Improvement Fund**, can cover kiosk hardware and software (we cite a subsidy of 70% as of 2024).

### Stakeholders {#stakeholders}

Four groups have a stake in how check-in is done, and their interests increasingly point in the same direction:

| Stakeholder | What they want | Relationship to kiosks |
|---|---|---|
| **Guests** | Skip queues, get the room card quickly, avoid repeated form-filling | Use the kiosk (or choose not to) |
| **Hotels (owners and managers)** | Cover 24/7 operations and peak hours despite a front-desk staff shortage; verify every guest; protect profit | Decide whether, where and how to deploy |
| **Government (STB, IMDA)** | Productivity and digital adoption in the sector | Regulate, certify vendors and fund adoption |
| **Solution providers** | Sell and integrate check-in solutions | Supply and maintain the hardware and software |

### Why kiosks {#why-kiosks}

Across the stakeholder map, one solution recurs: the **self-service kiosk**. Guests want to skip the queue; hotels are short of front-desk staff and need peak and round-the-clock cover; the government pushes and funds digital check-in; and a certified vendor market exists to supply it.

Kiosks have also delivered measurable results in other industries. McDonald's reported larger average order sizes (about 20%) after introducing ordering kiosks, partly through upselling. Changi Airport's passport-free immigration clearance, fully rolled out in September 2024, cut average clearance time from 25 seconds to about 10. Retail chains such as Uniqlo have used self-checkout to shorten transaction times. Chapter 4 examines these cases and their limits in more detail, including cases where self-service has been scaled back.

The question that motivated our project, then, is not *whether* kiosks make sense for hotels, but a more difficult one: **how well are they actually working, and what can we learn from the hotels that have already adopted them?**
