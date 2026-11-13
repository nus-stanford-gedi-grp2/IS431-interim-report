## 5. Prototype Development {#prototype-development}

### Playbook rationale and structure {#playbook-development}

#### Why a playbook, and not a better kiosk {#why-playbook}

Our hotel visits (Chapter 4) surfaced six recurring problems with kiosks in practice: basic functionality (passport scan errors, bookings that fail to link, payment failures, jammed or missing key cards), clunky UI/UX, cabling, poor positioning, difficulty handling large tasks such as multi-room bookings, and a lingering demand for human touch. The natural reaction would be to design a better kiosk. We chose not to, for three reasons:

1. **Kiosk design is a minor factor.** The gap between Ascott's average kiosk utilisation of about 20% and The Ridge's 85% was driven largely by factors outside the machine: placement, visibility, staff training, guest fit and reliability. A better kiosk would leave most of that gap untouched.
2. **Fixing one pain point is not enough.** A tool that rectified a single hotel's current problem would not prevent the next manager from making different mistakes. We would need to address every pain point, across properties that serve very different guests.
3. **Hotels differ.** Luxury, mid-range and budget hotels, and hotels with different guest mixes, face different trade-offs. The valuable thing to hand over was not a single answer but a way of reaching the right answer for each property.

Our answer was therefore **not to build the best kiosk in the world, but to help managers understand how to implement kiosks well**: the strategy behind them, how they are operated, and what to do and avoid.

#### Reviewing other's playbooks

Before planning our prototype, we reviewed existing kiosk implementation guides, including the Singapore Tourism Board's (STB) Best Practices in Implementing Self Check-in Solutions and Cammax's A Bite-Sized Guide to Kiosk Deployment.

The STB guide provides hospitality-specific recommendations across the guest journey, covering aspects such as interface design, kiosk visibility, and staff guidance (Singapore Tourism Board, 2024). Meanwhile, Cammax offers broader considerations for kiosk deployment, including hardware selection, software, placement, and maintenance (Cammax, n.d.).

While both provide valuable guidance, their static formats offer limited support for tailoring recommendations to individual hotel contexts. Managers must independently interpret the recommendations and assess their applicability to their property's guest demographics, operational needs, and financial constraints.

This highlighted an opportunity to develop a more interactive and personalised decision-support tool, allowing managers to apply established principles to their own hotel circumstances rather than relying solely on general recommendations.

#### Deciding the form of the prototype {#playbook-requirements}

We began by asking two questions: *How do we help hotels make better decisions during kiosk implementation?* and *How do we create a guide that helps them handle the nuances of integrating a kiosk, not just designing one?* From these, we set out the requirements for the prototype, also incorporating the established guidance provided by STB and Cammax's playbooks.

- **Audience.** The primary reader is the hotel manager responsible for the decision, but consultants and kiosk vendors are also likely users, so the content has to work for all three.
- **Guided, not just informative.** Managers are often unsure or unaware of what they actually want from a kiosk (e.g. lower manpower cost? smoother arrival? a more innovative brand?). The first job of the prototype is to help them clarify their objective, with later content adapting to it.
- **Interactive and personalised.** Each stage should include an activity or template for the reader to complete, such as a guest persona or goal-setting exercise, with the reader's own values driving the results. This helps them move from theory to action.
- **Covers the full journey.** It should address strategy, design and execution so that no stage is left unsupported, and should include a cost-benefit analysis so managers can build a financial case for their owners.
- **Usable beyond the session.** Completed work should be exportable so that managers can take it into discussions with owners, vendors or funding agencies.

A static report or checklist would meet only the first of these. An interactive web-based **playbook** for the manager would meet all of them, which is why we chose it as the Phase I prototype.

#### Structure: Strategy, Design, Execution {#playbook-structure}

The playbook follows three stages, mirroring how a hotel moves from deciding on a kiosk to running one:

| Stage | Question it answers | What the manager does |
|---|---|---|
| **Strategy** | Are kiosks the appropriate solution, and what do we want from it? | <ul><li>Define objectives and set measurable goals</li><li>Profile guests based on certain attributes that affect their likelihood of using a kiosk. These attributes were derived from sample user personas we created to understand the varying needs of guests, and were also confirmed by our industry professionals as attributes available in the hotel PMS</li><li>Assess kiosk suitability based on the defined attributes</li></ul> |
| **Design** | What should the kiosk and its setting look like? | <ul><li>Apply principles for placement, physical and inclusive design, UI/UX, human–kiosk handoff, security and privacy, and guest fit</li><li>Compare candidate placements using the Kiosk Placement Studio based on aspects such as visibility, accessibility, electrical port locations, and staff proximity</li></ul> |
| **Execution** | How do we deploy and run it? | Identify work to be done in four workstreams: <ul><li>Product - procuring the kiosks</li><li>Infrastructure - integration of the kiosks into physical and digital systems</li><li>Manpower - staff training and revision of Terms of Reference</li><li>Maintenance and Upgrades - ensuring the kiosk is up to date in meeting guest needs</li></ul>|

The playbook concludes with a **cost-benefit analysis**, allowing the manager to make a quick comparison of the quantitative and qualitative benefits they stand to gain against the investment required for kiosk implementation.

### Interactive implementation playbook {#interactive-playbook}

Explore the playbook below, or [open the standalone playbook](apps/playbook/index.html){ .playbook-link target="_blank" rel="noopener" } in a new tab for more space.

<div class="playbook-embed">
  <iframe
    src="apps/playbook/index.html"
    title="Hotel self-service kiosk implementation playbook"
    loading="lazy"
    allow="fullscreen"
    allowfullscreen>
  </iframe>
</div>

*Use the playbook's own menu and Previous/Next buttons to navigate its slides. The report continues below.*

### Playbook deployment {#playbook-deployment}
The playbook will be hosted online as a website, allowing hotel managers to access and utilise its interactive tools conveniently. Given the sensitivity of guest and financial data, user inputs will not be stored on the website to safeguard data privacy. Instead, users will be able to download a copy of the completed playbook, including their inputs and calculated results, for future reference and decision-making.
