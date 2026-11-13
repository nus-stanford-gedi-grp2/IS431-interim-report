## 6. Evaluation {#evaluation}

### Feedback and validation {#feedback-validation}

To evaluate the playbook's practical relevance and usability, we sought feedback from industry professionals at The Ridge NUS and Ascott. Their feedback provided insights into the playbook's potential applications, strengths, and areas for improvement.

#### Feedback from The Ridge NUS

We sought feedback from **Mr Sherwin Poh**, who responded positively to the playbook, highlighting its potential to guide hotel operators towards more comprehensive and informed decisions during kiosk implementation.

> "[The playbook's] great, I would have used it as a guide to make more informed considerations when planning as there may have been things I didn't think about."
>
> ~ Mr Sherwin Poh, Senior Manager (Operations), The Ridge NUS

Mr Poh highlighted several features that could support hotel operators throughout the planning process.

1. The **Kiosk Suitability Assessment** provides a structured evaluation of whether self-service kiosks are appropriate for a hotel. He noted that the resulting suitability rating could help operators justify their recommendations and secure buy-in from senior management.

2. The **Kiosk Placement Tool** allows operators to visualise guest flow and compare different kiosk locations. This could facilitate more informed placement decisions by helping operators assess alternative lobby configurations.

3. The **Cost-Benefit Calculator** provides an initial financial assessment of kiosk implementation. Mr Poh noted that this could be particularly useful in supporting applications for Singapore Tourism Board (STB) grants.

#### Feedback from Ascott

We also sought feedback from **Mr Michael Lee**, who expressed appreciation for the playbook and his intention to share it with Ascott's building managers.
More specifically, he commented about the following:

1. The **Design Principles** section is a particularly useful component of the playbook to guide kiosk design decisions. It is valuable and helps put together kiosk design considerations.  

2. The **Cost-Benefit Analysis** is helpful for managers like himself. To push this tool further, it could be integrated with Ascott's existing databases on Power BI. Financial evaluations drawing directly from operational data provides further value add in reducing the need for manual inputs.

3. One area for improvement was the **User Persona Development** section. Mr Lee noted that it was not intuitively clear that the personas were intended to adaptively represent any hotel's most common guest archetypes according to guest data. 
    <ul>
The playbook has since been tweaked to reflect an overall guest composition chart that leads to a composite kiosk propensity score for the establishment, as seen in `screen 14` of the embedded prototype above.
    <ul>

#### Overall Takeaways

The feedback from both hotel managers were encouraging, highlighting the playbook's potential to support other hotel managers make informed decisions for effective kiosk implementations. Most notably, the design principles, placement visualisation, and financial evaluation tools were identified as valuable components.

The feedback also revealed opportunities to improve the playbook's clarity and integration with existing hotel systems, providing useful directions for future refinement.

### A Good Hotel Arrival Experience {#arrival-experience-alignment}

In Chapter 3, criteria for a good arrival experience were established with reference to _ISO 22483:2020_. Beyond a quick check-in, guests should be able to find their way, understand the process at a glance, and receive help whenever needed. A kiosk can speed up the check-in, but it has to be deployed thoughtfully. 

The playbook is designed to improve the arrival experience according to the criteria set:

| Criteria for _a good arrival experience_ | How the playbook supports this criteria |
|---|---|
| Clear reception **signage** | **Placement principles** call for signage that makes kiosk use and eligibility clear, and the **Kiosk Placement Tool** rates locations on visibility. |
| Effective **communication** | UI/UX principles favour **scanning** over typing, and the kiosk is configured for guests' **languages**. |
| Prompt, courteous **assistance** | The **Kiosk Suitability Assessment** recommends staff nearby, or the counter, when the guest mix needs it. Execution covers **staff training** and hand-offs from kiosk to staff. |
| **Accessibility** | **Inclusive design principles** cover height, reach and font size, and the **Kiosk Placement Tool** rates accessibility. |
| **Security** procedures | Security and **privacy principles**, such as privacy screens and keeping personal details off the display. |

This alignment is by design. The playbook considers fundamental principles to guide considerations for hotel managers at each step of the kiosk implementation beyond the kiosk hardware purchase. 

### Areas for Improvement {#areas-for-improvement}

While the playbook provides a structured approach to kiosk implementation, several limitations remain. These primarily stem from limited access to hotel-specific operational data and the need for further validation by more industry professionals.

#### 1. Kiosk Suitability Assessment Weightages

A guest's propensity for kiosk adoption is most likely influenced by varying weights of the identified guest attributes, but these weights have not been empirically tuned. Due to limited access to hotel-specific guest data, we currently assign equal weights to the guest attributes used in evaluating their likelihood of rejecting or accepting kiosk check-ins. 

Further _data collection and analysis of guest data_ would be required to refine the weighting system and improve the accuracy of suitability assessments. Mr Lee has given an update that he has almost completed his process in consolidating a dataset of de-identified guest data with the requested attribute fields. Model and parameter training can begin when this dataset is shared, for us to develop a kiosk suitability model grounded on real numbers.

#### 2. Kiosk Placement Tool Evaluation is Subjective

The Kiosk Placement Tool currently evaluates potential kiosk locations using a set of criteria and scoring logic developed by the team. While these are based on reasonable design considerations, the thresholds and ratings remain partly subjective and do not fully capture complexities of actual hotel environments yet.

_Consulting interior designers_ and experienced hotel managers would help validate the evaluation criteria, identify any overlooked considerations, and improve the tool's applicability across different lobby layouts and operational contexts.

#### 3. Scope of the Execution Framework

The Execution section was developed based on initial fieldwork, conversations with hotel staff, and secondary research. While the four identified workstreams cover key aspects of kiosk implementation, they may not be exhaustive. Certain critical activities or finer operational details may have been overlooked.

Further input from _hotel managers with experience in technology adoption and implementation_ would be valuable in validating the framework's completeness and refining the guidance within each workstream.


