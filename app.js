const SUPABASE_URL = 'https://eqgzfrzokhowpedderrb.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxZ3pmcnpva2hvd3BlZGRlcnJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjU4ODIsImV4cCI6MjA5NzIwMTg4Mn0.r94X0ZGSdAO_vtd4dXQKmjdVFtPZ7wSpYeUVzPAkjJo';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const GRADE_OPTIONS = ['TK','Kindergarten','1st Grade','2nd Grade','3rd Grade','4th Grade','5th Grade','6th Grade','7th Grade','8th Grade'];

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function gradeOptionsHTML(selected) {
  return '<option value="">— Select Grade —</option>' +
    GRADE_OPTIONS.map(g => `<option value="${g}"${g === selected ? ' selected' : ''}>${g}</option>`).join('');
}

const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];
function stateOptionsHTML(selected) {
  return '<option value="">— Select —</option>' +
    US_STATES.map(s => `<option value="${s}"${s === selected ? ' selected' : ''}>${s}</option>`).join('');
}

function shortToken(token) {
  if (!token) return '';
  return token.replace(/-/g, '').slice(-8).toUpperCase();
}

function renderSignatureStamp(a) {
  if (!a || !a.signature_name) return '';
  const dateStr = a.signature_date
    ? new Date(a.signature_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  return `
    <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:16px 18px;margin:20px 0;display:flex;align-items:flex-start;gap:12px;">
      <span style="flex-shrink:0;width:26px;height:26px;border-radius:50%;background:#22c55e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:700;">&#10003;</span>
      <div>
        <div style="font-family:'Trebuchet MS',sans-serif;font-weight:700;font-size:0.92rem;color:#166534;">Electronically Signed</div>
        <div style="font-size:0.85rem;color:#3A2E2A;margin-top:2px;">${esc(a.signature_name)}${dateStr ? ' · ' + esc(dateStr) : ''}</div>
        ${a.signature_token ? `<div style="font-size:0.78rem;color:#5a8a68;margin-top:2px;font-family:monospace;">Reference: ${esc(shortToken(a.signature_token))}</div>` : ''}
      </div>
    </div>`;
}

function formatPhoneDisplay(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 10) return value;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

function formatPhoneInputEl(el) {
  el.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g,'').slice(0,10);
    if (v.length >= 7) v = '(' + v.slice(0,3) + ') ' + v.slice(3,6) + '-' + v.slice(6);
    else if (v.length >= 4) v = '(' + v.slice(0,3) + ') ' + v.slice(3);
    else if (v.length > 0) v = '(' + v;
    e.target.value = v;
  });
}

function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function showOnly(id) {
  ['loadingScreen','codeScreen','submittedScreen','applicationForm'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = (sid === id) ? 'block' : 'none';
  });
  const sub = document.getElementById('pageHeaderSub');
  if (sub) sub.style.display = (id === 'codeScreen') ? 'block' : 'none';
}

function calculateAgeFromDob(dobStr) {
  if (!dobStr) return '';
  const dob = new Date(dobStr + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear = (today.getMonth() > dob.getMonth()) ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age >= 0 ? age : '';
}

// ── STATE ────────────────────────────────────────────────────
let currentCode = null;
let familyData = null;       // last full response from validate_admission_family_code
let children = [];           // local editable copies of each child, keyed by id
let familyForm = {};         // local editable copies of family-level fields
let steps = [];               // computed step list: {type, childIndex}
let currentStepIndex = 0;

function getCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('code');
}

async function init() {
  const urlCode = getCodeFromUrl();
  if (urlCode) {
    document.getElementById('codeInput').value = urlCode;
    await attemptValidateCode(urlCode);
  } else {
    showOnly('codeScreen');
  }
}

document.getElementById('codeSubmitBtn').addEventListener('click', () => {
  const code = document.getElementById('codeInput').value.trim();
  if (!code) { document.getElementById('codeError').textContent = 'Please enter your access code.'; return; }
  attemptValidateCode(code);
});
document.getElementById('codeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('codeSubmitBtn').click();
});
document.getElementById('codeInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

async function attemptValidateCode(code) {
  showOnly('loadingScreen');
  document.getElementById('codeError').textContent = '';

  const { data, error } = await sb.rpc('validate_admission_family_code', { p_code: code });

  if (error || !data || !data.valid) {
    showOnly('codeScreen');
    document.getElementById('codeError').textContent =
      (data && data.reason === 'expired')
        ? 'This code has expired. Please contact the office for help.'
        : 'That code was not found. Please check it and try again.';
    return;
  }

  currentCode = code.trim().toUpperCase();
  familyData = data;

  if (data.status === 'submitted') {
    showSubmittedScreen(data);
    return;
  }

  prefillFromFamilyData(data);
  showOnly('applicationForm');
  buildSteps();
  goToStep(0);
}

function showSubmittedScreen(data) {
  const mount = document.getElementById('childDecisionsMount');
  const labels = { pending: ['Awaiting Decision', '#8a7d74'], accepted: ['Admitted 🎉', '#16a34a'], waitlisted: ['Waitlisted', '#A66A1E'], declined: ['Decision Made', '#9a8b84'] };
  mount.innerHTML = (data.children || []).map(c => {
    const [label, color] = labels[c.decision] || labels.pending;
    return `<div class="apply-decision-row"><span class="name">${esc(c.student_full_name || 'Student')}</span><span style="color:${color};font-weight:700;font-size:0.85rem;">${label}</span></div>`;
  }).join('');
  document.getElementById('signatureStampMount').innerHTML = renderSignatureStamp(data);
  showOnly('submittedScreen');
}

// ── PREFILL FROM SERVER DATA INTO LOCAL EDITABLE STATE ──────
function prefillFromFamilyData(data) {
  familyForm = {
    church_affiliation: data.church_affiliation || '',
    referral_source: data.referral_source || '',
    emergency_contact_name: data.emergency_contact_name || '',
    emergency_contact_relationship: data.emergency_contact_relationship || '',
    emergency_contact_phone: data.emergency_contact_phone || '',
    ncs_family_reference_name: data.ncs_family_reference_name || '',
    ncs_family_reference_email: data.ncs_family_reference_email || '',
    ncs_family_reference_phone: data.ncs_family_reference_phone || '',
    agreement_accepted: !!data.agreement_accepted,
    signature_name: data.signature_name || '',
    signature_date: data.signature_date || '',
    sofOpened: false
  };

  children = (data.children && data.children.length ? data.children : [{}]).map(c => ({
    id: c.id,
    student_full_name: c.student_full_name || '',
    nickname: c.nickname || '',
    dob: c.dob || '',
    gender: c.gender || '',
    anticipated_grade: c.anticipated_grade || '',
    previous_schools: Array.isArray(c.previous_schools) ? c.previous_schools.slice() : [],
    last_grade_completed: c.last_grade_completed || '',
    repeated_grade: c.repeated_grade,
    repeated_grade_explain: c.repeated_grade_explain || '',
    disciplinary_history: c.disciplinary_history,
    disciplinary_explain: c.disciplinary_explain || '',
    learning_needs: c.learning_needs,
    learning_needs_explain: c.learning_needs_explain || '',
    medical_notes: c.medical_notes || ''
  }));
}

// ── STEP LIST ────────────────────────────────────────────────
function buildSteps() {
  steps = [];
  children.forEach((c, i) => {
    steps.push({ type: 'child-info', childIndex: i });
    steps.push({ type: 'child-school', childIndex: i });
    steps.push({ type: 'child-needs', childIndex: i });
    steps.push({ type: 'child-behavior', childIndex: i });
    steps.push({ type: 'child-teacher', childIndex: i });
  });
  steps.push({ type: 'pastoral' });
  steps.push({ type: 'personal' });
  steps.push({ type: 'ncs-ref' });
  steps.push({ type: 'church-referral' });
  steps.push({ type: 'emergency' });
  steps.push({ type: 'agreement' });
}

function renderStepDots() {
  document.getElementById('stepDots').innerHTML = steps.map((s, i) =>
    `<span class="apply-step-dot ${i === currentStepIndex ? 'active' : ''} ${i < currentStepIndex ? 'done' : ''}"></span>`
  ).join('');
}

// ── NAVIGATION ───────────────────────────────────────────────
let stepMounted = false;

function goToStep(index) {
  if (stepMounted) saveCurrentStepIntoState(); // persist whatever's on screen before leaving it
  currentStepIndex = Math.max(0, Math.min(index, steps.length - 1));
  renderStepDots();
  renderCurrentStep();
  stepMounted = true;

  document.getElementById('prevStepBtn').style.display = currentStepIndex > 0 ? 'block' : 'none';
  const isLast = currentStepIndex === steps.length - 1;
  document.getElementById('nextStepBtn').style.display = isLast ? 'none' : 'block';
  document.getElementById('submitAppBtn').style.display = isLast ? 'block' : 'none';
  document.getElementById('formError').textContent = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('nextStepBtn').addEventListener('click', () => {
  const err = validateCurrentStep();
  if (err) { document.getElementById('formError').textContent = err; return; }
  if (currentStepIndex < steps.length - 1) goToStep(currentStepIndex + 1);
});
document.getElementById('prevStepBtn').addEventListener('click', () => {
  if (currentStepIndex > 0) goToStep(currentStepIndex - 1);
});

// ── STEP RENDERING ───────────────────────────────────────────
function renderCurrentStep() {
  const step = steps[currentStepIndex];
  const mount = document.getElementById('stepMount');
  mount.innerHTML = stepHTML(step);
  wireStepEvents(step);
}

function childLabel(child, index) {
  return child.student_full_name ? esc(child.student_full_name) : `Child ${index + 1}`;
}

function stepHTML(step) {
  if (step.type.startsWith('child-')) return childStepHTML(step);
  return familyStepHTML(step);
}

function childStepHTML(step) {
  const c = children[step.childIndex];
  const removable = children.length > 1;
  const header = `
    <div class="apply-child-header">
      <div class="apply-section-title" style="margin-bottom:0;">${childLabel(c, step.childIndex)}</div>
      ${removable ? `<button type="button" class="apply-remove-child" data-remove-child="${step.childIndex}">Remove this child</button>` : ''}
    </div>`;

  if (step.type === 'child-info') {
    return `<div class="apply-card">
      ${header}
      <div class="apply-section-sub">Confirm or update this child's details.</div>
      <div class="apply-row single">
        <div class="apply-field"><label>Student's Full Name</label><input type="text" id="f-student-name"></div>
      </div>
      <div class="apply-row">
        <div class="apply-field"><label>Nickname <span class="hint">(optional)</span></label><input type="text" id="f-nickname"></div>
        <div class="apply-field"><label>Date of Birth</label><input type="date" id="f-dob"></div>
      </div>
      <div class="apply-row">
        <div class="apply-field"><label>Age <span class="hint">(auto-filled from DOB)</span></label><input type="number" id="f-age" readonly style="background:#f3eee9;"></div>
        <div class="apply-field"><label>Gender</label>
          <select id="f-gender"><option value="">— Select —</option><option value="Male">Male</option><option value="Female">Female</option></select>
        </div>
      </div>
      <div class="apply-row single">
        <div class="apply-field"><label>Anticipated Grade Placement</label><select id="f-grade">${gradeOptionsHTML(c.anticipated_grade)}</select></div>
      </div>
    </div>`;
  }

  if (step.type === 'child-school') {
    return `<div class="apply-card">
      ${header}
      <div class="apply-section-sub">Tell us about this child's previous schooling.</div>
      <div id="schoolsContainer"></div>
      <button type="button" class="apply-add-btn" id="addSchoolBtn">+ Add a Previous School</button>
      <div class="apply-row single" style="margin-top:20px;">
        <div class="apply-field"><label>Last Grade Completed</label><select id="f-last-grade">${gradeOptionsHTML(c.last_grade_completed)}</select></div>
      </div>
      <div class="apply-field" style="margin-bottom:16px;">
        <label>Has this child ever repeated a grade?</label>
        <div class="apply-yesno" id="repeatedGradeToggle"><button type="button" data-value="true">Yes</button><button type="button" data-value="false">No</button></div>
      </div>
      <div class="apply-row single" id="repeatedGradeExplainWrap" style="display:none;">
        <div class="apply-field"><label>Please explain</label><textarea id="f-repeated-explain"></textarea></div>
      </div>
      <div class="apply-field" style="margin-bottom:16px;">
        <label>Has this child ever been dismissed, suspended, or expelled?</label>
        <div class="apply-yesno" id="disciplinaryToggle"><button type="button" data-value="true">Yes</button><button type="button" data-value="false">No</button></div>
      </div>
      <div class="apply-row single" id="disciplinaryExplainWrap" style="display:none;">
        <div class="apply-field"><label>Please explain</label><textarea id="f-disciplinary-explain"></textarea></div>
      </div>
    </div>`;
  }

  if (step.type === 'child-needs') {
    return `<div class="apply-card">
      ${header}
      <div class="apply-section-sub">This helps us support this child well from day one.</div>
      <div class="apply-field" style="margin-bottom:16px;">
        <label>Any diagnosed learning differences, IEP, or 504 plan?</label>
        <div class="apply-yesno" id="learningNeedsToggle"><button type="button" data-value="true">Yes</button><button type="button" data-value="false">No</button></div>
      </div>
      <div class="apply-row single" id="learningNeedsExplainWrap" style="display:none;">
        <div class="apply-field"><label>Please explain</label><textarea id="f-learning-explain"></textarea></div>
      </div>
      <div class="apply-row single">
        <div class="apply-field"><label>Medical conditions, allergies, or medications <span class="hint">(optional)</span></label><textarea id="f-medical"></textarea></div>
      </div>
    </div>`;
  }

  if (step.type === 'child-behavior') {
    return `<div class="apply-card">
      ${header}
      <div class="apply-section-sub">Please complete this questionnaire about this child's everyday behavior.</div>
      <p style="font-size:0.9rem;color:#5a4d47;line-height:1.7;margin-bottom:16px;">
        Please download the form below and upload it here once complete. You can also send the form to
        <a href="mailto:admissionsgroup@northridgecommunityschool.com" style="color:var(--bronze);">admissionsgroup@northridgecommunityschool.com</a> if you wish.
      </p>
      <a href="forms/behavior-skills-questionnaire.pdf" target="_blank" rel="noopener" class="apply-btn-secondary" style="display:inline-block;text-align:center;text-decoration:none;width:100%;box-sizing:border-box;margin-bottom:20px;">Download Behavior Skills Questionnaire</a>
      <div class="apply-field">
        <label>Upload Completed Questionnaire <span class="hint">(optional)</span></label>
        <input type="file" id="f-ref-upload" data-ref-type="behavior" accept=".pdf,.jpg,.jpeg,.png">
      </div>
      <div class="apply-ref-status" id="f-ref-status" style="font-size:0.85rem;color:#9a8b84;margin-top:8px;"></div>
    </div>`;
  }

  if (step.type === 'child-teacher') {
    const isLastChild = step.childIndex === children.length - 1;
    return `<div class="apply-card">
      ${header}
      <div class="apply-section-sub">An academic and character assessment from this child's current or most recent teacher.</div>
      <p style="font-size:0.9rem;color:#5a4d47;line-height:1.7;margin-bottom:16px;">
        Please download the form below and upload it here once complete. You can also send the form to
        <a href="mailto:admissionsgroup@northridgecommunityschool.com" style="color:var(--bronze);">admissionsgroup@northridgecommunityschool.com</a> if you wish.
      </p>
      <a href="forms/teacher-assessment.pdf" target="_blank" rel="noopener" class="apply-btn-secondary" style="display:inline-block;text-align:center;text-decoration:none;width:100%;box-sizing:border-box;margin-bottom:20px;">Download Teacher Assessment Form</a>
      <div class="apply-field">
        <label>Upload Completed Assessment <span class="hint">(optional)</span></label>
        <input type="file" id="f-ref-upload" data-ref-type="teacher_assessment" accept=".pdf,.jpg,.jpeg,.png">
      </div>
      <div class="apply-ref-status" id="f-ref-status" style="font-size:0.85rem;color:#9a8b84;margin-top:8px;"></div>
      ${isLastChild ? `<button type="button" class="apply-add-btn" id="addChildBtn" style="margin-top:20px;">+ Add Another Child</button>` : ''}
    </div>`;
  }
}

function familyStepHTML(step) {
  if (step.type === 'pastoral') {
    return `<div class="apply-card">
      <div class="apply-section-title">Pastoral Reference</div>
      <div class="apply-section-sub">One reference from a pastor or church leader covers your whole family.</div>
      <p style="font-size:0.9rem;color:#5a4d47;line-height:1.7;margin-bottom:16px;">
        Please download the form below and upload it here once complete. You can also send the form to
        <a href="mailto:admissionsgroup@northridgecommunityschool.com" style="color:var(--bronze);">admissionsgroup@northridgecommunityschool.com</a> if you wish.
      </p>
      <a href="forms/pastoral-reference.pdf" target="_blank" rel="noopener" class="apply-btn-secondary" style="display:inline-block;text-align:center;text-decoration:none;width:100%;box-sizing:border-box;margin-bottom:20px;">Download Pastoral Reference Form</a>
      <div class="apply-field">
        <label>Upload Completed Reference <span class="hint">(optional)</span></label>
        <input type="file" id="f-ref-upload" data-ref-type="pastoral" accept=".pdf,.jpg,.jpeg,.png">
      </div>
      <div class="apply-ref-status" id="f-ref-status" style="font-size:0.85rem;color:#9a8b84;margin-top:8px;"></div>
    </div>`;
  }

  if (step.type === 'personal') {
    return `<div class="apply-card">
      <div class="apply-section-title">Mature Christian Reference</div>
      <div class="apply-section-sub">A reference from a mature Christian who knows your family well (other than your pastor). One covers your whole family.</div>
      <p style="font-size:0.9rem;color:#5a4d47;line-height:1.7;margin-bottom:16px;">
        Please download the form below and upload it here once complete. You can also send the form to
        <a href="mailto:admissionsgroup@northridgecommunityschool.com" style="color:var(--bronze);">admissionsgroup@northridgecommunityschool.com</a> if you wish.
      </p>
      <a href="forms/personal-reference.pdf" target="_blank" rel="noopener" class="apply-btn-secondary" style="display:inline-block;text-align:center;text-decoration:none;width:100%;box-sizing:border-box;margin-bottom:20px;">Download Mature Christian Reference Form</a>
      <div class="apply-field">
        <label>Upload Completed Reference <span class="hint">(optional)</span></label>
        <input type="file" id="f-ref-upload" data-ref-type="mature_christian" accept=".pdf,.jpg,.jpeg,.png">
      </div>
      <div class="apply-ref-status" id="f-ref-status" style="font-size:0.85rem;color:#9a8b84;margin-top:8px;"></div>
    </div>`;
  }

  if (step.type === 'ncs-ref') {
    return `<div class="apply-card">
      <div class="apply-section-title">NCS Family Reference <span class="hint">(optional)</span></div>
      <div class="apply-section-sub">If you know a family already enrolled at NCS who'd be willing to speak on your behalf, share their contact info here.</div>
      <div class="apply-row single"><div class="apply-field"><label>Parent Name</label><input type="text" id="f-ncsref-name"></div></div>
      <div class="apply-row">
        <div class="apply-field"><label>Email</label><input type="email" id="f-ncsref-email"></div>
        <div class="apply-field"><label>Phone</label><input type="tel" id="f-ncsref-phone"></div>
      </div>
    </div>`;
  }

  if (step.type === 'church-referral') {
    return `<div class="apply-card">
      <div class="apply-section-title">Church &amp; Referral</div>
      <div class="apply-row">
        <div class="apply-field"><label>Church Home / Affiliation <span class="hint">(optional)</span></label><input type="text" id="f-church"></div>
        <div class="apply-field"><label>How did you hear about NCS?</label><input type="text" id="f-referral"></div>
      </div>
    </div>`;
  }

  if (step.type === 'emergency') {
    return `<div class="apply-card">
      <div class="apply-section-title">Emergency Contact</div>
      <div class="apply-section-sub">Someone we can reach if a parent/guardian is unavailable <span class="hint">(optional)</span>.</div>
      <div class="apply-row">
        <div class="apply-field"><label>Name</label><input type="text" id="f-ec-name"></div>
        <div class="apply-field"><label>Relationship</label><input type="text" id="f-ec-relationship"></div>
      </div>
      <div class="apply-row single"><div class="apply-field"><label>Phone</label><input type="tel" id="f-ec-phone"></div></div>
    </div>`;
  }

  if (step.type === 'agreement') {
    return `<div class="apply-card">
      <div class="apply-section-title">Agreement</div>
      <div class="apply-accordion" id="sofAccordion">
        <button type="button" class="apply-accordion-header" id="sofAccordionToggle">
          <span>Statement of Faith <span class="hint">(tap to expand — required)</span></span>
          <span class="apply-accordion-arrow" id="sofAccordionArrow">▾</span>
        </button>
        <div class="apply-accordion-body" id="sofAccordionBody">
          <p>We believe the Bible to be the authoritative Word of God, inerrant and infallible. We believe in one true God manifested eternally in three Persons — Father, Son, and Holy Spirit — and in the deity, virgin birth, atoning death, and bodily resurrection of Jesus Christ. We believe salvation is a free gift of grace received by faith, and that marriage is a covenant between one man and one woman as delineated in Scripture.</p>
        </div>
      </div>
      <div class="apply-agree">
        <input type="checkbox" id="f-agreement" disabled>
        <label for="f-agreement">I have read and agree to the Statement of Faith above.</label>
      </div>
      <p style="font-size:0.85rem;margin:-6px 0 4px;">
        <a href="biblical-foundations.pdf" target="_blank" rel="noopener" style="color:var(--bronze);font-family:'Trebuchet MS',sans-serif;font-weight:700;text-decoration:none;">View our full Biblical Foundations Statement →</a>
      </p>
      <div class="apply-row">
        <div class="apply-field"><label>Parent Signature <span class="hint">(type full name)</span></label><input type="text" id="f-signature-name"></div>
        <div class="apply-field"><label>Date</label><input type="date" id="f-signature-date"></div>
      </div>
    </div>`;
  }
}

// ── WIRE UP EVENTS + PREFILL FOR THE CURRENTLY RENDERED STEP ─
function wireStepEvents(step) {
  if (step.type.startsWith('child-')) {
    const c = children[step.childIndex];

    document.querySelectorAll('[data-remove-child]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.removeChild);
        const child = children[idx];
        if (!confirm(`Remove ${childLabel(child, idx)} from this application?`)) return;
        if (child.id) {
          const { data, error } = await sb.rpc('remove_admission_family_child', { p_code: currentCode, p_child_id: child.id });
          if (error || !data || !data.success) { showToast('Could not remove child — please try again.'); return; }
        }
        children.splice(idx, 1);
        buildSteps();
        stepMounted = false; // indices just shifted — don't save the now-mismatched old step over the new layout
        goToStep(0);
      });
    });

    if (step.type === 'child-info') {
      document.getElementById('f-student-name').value = c.student_full_name;
      document.getElementById('f-nickname').value = c.nickname;
      document.getElementById('f-dob').value = c.dob;
      document.getElementById('f-age').value = calculateAgeFromDob(c.dob);
      document.getElementById('f-gender').value = c.gender;
      document.getElementById('f-grade').value = c.anticipated_grade;
      document.getElementById('f-dob').addEventListener('input', (e) => {
        document.getElementById('f-age').value = calculateAgeFromDob(e.target.value);
      });
    }

    if (step.type === 'child-school') {
      document.getElementById('schoolsContainer').innerHTML = '';
      (c.previous_schools.length ? c.previous_schools : [{}]).forEach(s => addSchoolRow(s));
      document.getElementById('addSchoolBtn').addEventListener('click', () => addSchoolRow());
      document.getElementById('f-last-grade').value = c.last_grade_completed;
      setYesNo('repeatedGradeToggle', c.repeated_grade);
      document.getElementById('f-repeated-explain').value = c.repeated_grade_explain;
      toggleExplainWrap('repeatedGradeExplainWrap', c.repeated_grade === true);
      setYesNo('disciplinaryToggle', c.disciplinary_history);
      document.getElementById('f-disciplinary-explain').value = c.disciplinary_explain;
      toggleExplainWrap('disciplinaryExplainWrap', c.disciplinary_history === true);
      wireYesNo('repeatedGradeToggle', 'repeatedGradeExplainWrap');
      wireYesNo('disciplinaryToggle', 'disciplinaryExplainWrap');
    }

    if (step.type === 'child-needs') {
      setYesNo('learningNeedsToggle', c.learning_needs);
      document.getElementById('f-learning-explain').value = c.learning_needs_explain;
      toggleExplainWrap('learningNeedsExplainWrap', c.learning_needs === true);
      document.getElementById('f-medical').value = c.medical_notes;
      wireYesNo('learningNeedsToggle', 'learningNeedsExplainWrap');
    }

    if (step.type === 'child-behavior' || step.type === 'child-teacher') {
      wireRefUpload(c.id);
      if (step.type === 'child-teacher') {
        const addBtn = document.getElementById('addChildBtn');
        if (addBtn) addBtn.addEventListener('click', addAnotherChild);
      }
    }
    return;
  }

  // Family-level steps
  if (step.type === 'pastoral') wireRefUpload(null);
  if (step.type === 'personal') wireRefUpload(null);

  if (step.type === 'ncs-ref') {
    document.getElementById('f-ncsref-name').value = familyForm.ncs_family_reference_name;
    document.getElementById('f-ncsref-email').value = familyForm.ncs_family_reference_email;
    document.getElementById('f-ncsref-phone').value = familyForm.ncs_family_reference_phone;
    formatPhoneInputEl(document.getElementById('f-ncsref-phone'));
  }

  if (step.type === 'church-referral') {
    document.getElementById('f-church').value = familyForm.church_affiliation;
    document.getElementById('f-referral').value = familyForm.referral_source;
  }

  if (step.type === 'emergency') {
    document.getElementById('f-ec-name').value = familyForm.emergency_contact_name;
    document.getElementById('f-ec-relationship').value = familyForm.emergency_contact_relationship;
    document.getElementById('f-ec-phone').value = familyForm.emergency_contact_phone;
    formatPhoneInputEl(document.getElementById('f-ec-phone'));
  }

  if (step.type === 'agreement') {
    document.getElementById('f-signature-name').value = familyForm.signature_name;
    document.getElementById('f-signature-date').value = familyForm.signature_date;
    document.getElementById('f-agreement').checked = familyForm.agreement_accepted;
    document.getElementById('f-agreement').disabled = !familyForm.sofOpened;
    document.getElementById('sofAccordionToggle').addEventListener('click', () => {
      const accordion = document.getElementById('sofAccordion');
      const isOpen = accordion.classList.toggle('open');
      document.getElementById('sofAccordionArrow').textContent = isOpen ? '▲' : '▾';
      familyForm.sofOpened = true;
      document.getElementById('f-agreement').disabled = false;
    });
  }
}

function wireRefUpload(childId) {
  const input = document.getElementById('f-ref-upload');
  const statusEl = document.getElementById('f-ref-status');
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const refType = input.dataset.refType;
    if (!file) return;
    if (!currentCode) { statusEl.textContent = 'Something went wrong — please refresh and try again.'; return; }

    statusEl.textContent = 'Uploading…'; statusEl.style.color = '#9a8b84';

    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const childSegment = childId ? `${childId}/` : '';
    const path = `${currentCode}/${refType}/${childSegment}${Date.now()}-${cleanName}`;

    const { error: uploadError } = await sb.storage.from('admission-references').upload(path, file);
    if (uploadError) { statusEl.textContent = 'Upload failed — please try again.'; statusEl.style.color = 'var(--red)'; return; }

    const { data, error } = await sb.rpc('attach_admission_family_reference', {
      p_code: currentCode, p_reference_type: refType, p_file_path: path, p_child_id: childId
    });
    if (error || !data || !data.success) { statusEl.textContent = 'Uploaded, but could not save — please contact the office.'; statusEl.style.color = 'var(--red)'; return; }

    statusEl.textContent = `Uploaded: ${file.name}`; statusEl.style.color = '#16a34a';
  });
}

async function addAnotherChild() {
  const { data, error } = await sb.rpc('add_admission_family_child', { p_code: currentCode });
  if (error || !data || !data.success) { showToast('Could not add another child — please try again.'); return; }
  children.push({
    id: data.child_id, student_full_name: '', nickname: '', dob: '', gender: '', anticipated_grade: '',
    previous_schools: [], last_grade_completed: '', repeated_grade: null, repeated_grade_explain: '',
    disciplinary_history: null, disciplinary_explain: '', learning_needs: null, learning_needs_explain: '', medical_notes: ''
  });
  buildSteps();
  goToStep((children.length - 1) * 5); // jump straight to the new child's first step
}

function setYesNo(groupId, value) {
  document.querySelectorAll(`#${groupId} button`).forEach(btn => {
    btn.classList.toggle('selected', value === (btn.dataset.value === 'true'));
  });
}
function toggleExplainWrap(id, show) { document.getElementById(id).style.display = show ? 'block' : 'none'; }
function wireYesNo(groupId, wrapId) {
  document.querySelectorAll(`#${groupId} button`).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`#${groupId} button`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      toggleExplainWrap(wrapId, btn.dataset.value === 'true');
    });
  });
}
function getYesNoValue(groupId) {
  const selected = document.querySelector(`#${groupId} button.selected`);
  return selected ? selected.dataset.value === 'true' : null;
}

function addSchoolRow(prefill) {
  const div = document.createElement('div');
  div.className = 'apply-repeat-row';
  div.innerHTML = `
    <button type="button" class="apply-repeat-remove" onclick="this.closest('.apply-repeat-row').remove()">Remove</button>
    <div class="apply-row">
      <div class="apply-field"><label>School Name</label><input type="text" class="school-name" value="${esc(prefill && prefill.name || '')}"></div>
      <div class="apply-field"><label>City</label><input type="text" class="school-city" value="${esc(prefill && prefill.city || '')}"></div>
    </div>
    <div class="apply-row single">
      <div class="apply-field"><label>State</label><select class="school-state">${stateOptionsHTML(prefill && prefill.state)}</select></div>
    </div>`;
  document.getElementById('schoolsContainer').appendChild(div);
}
function collectSchools() {
  return Array.from(document.querySelectorAll('#schoolsContainer .apply-repeat-row')).map(row => ({
    name: row.querySelector('.school-name').value.trim(),
    city: row.querySelector('.school-city').value.trim(),
    state: row.querySelector('.school-state').value.trim()
  })).filter(s => s.name || s.city || s.state);
}

// ── SAVE CURRENT SCREEN INTO LOCAL STATE (called before navigating away) ─
function saveCurrentStepIntoState() {
  if (!steps.length) return;
  const step = steps[currentStepIndex];
  if (!step) return;

  if (step.type.startsWith('child-')) {
    const c = children[step.childIndex];
    if (step.type === 'child-info') {
      c.student_full_name = document.getElementById('f-student-name').value.trim();
      c.nickname = document.getElementById('f-nickname').value.trim();
      c.dob = document.getElementById('f-dob').value;
      c.gender = document.getElementById('f-gender').value;
      c.anticipated_grade = document.getElementById('f-grade').value;
    }
    if (step.type === 'child-school') {
      c.previous_schools = collectSchools();
      c.last_grade_completed = document.getElementById('f-last-grade').value;
      c.repeated_grade = getYesNoValue('repeatedGradeToggle');
      c.repeated_grade_explain = document.getElementById('f-repeated-explain').value.trim();
      c.disciplinary_history = getYesNoValue('disciplinaryToggle');
      c.disciplinary_explain = document.getElementById('f-disciplinary-explain').value.trim();
    }
    if (step.type === 'child-needs') {
      c.learning_needs = getYesNoValue('learningNeedsToggle');
      c.learning_needs_explain = document.getElementById('f-learning-explain').value.trim();
      c.medical_notes = document.getElementById('f-medical').value.trim();
    }
    return;
  }

  if (step.type === 'ncs-ref') {
    familyForm.ncs_family_reference_name = document.getElementById('f-ncsref-name').value.trim();
    familyForm.ncs_family_reference_email = document.getElementById('f-ncsref-email').value.trim();
    familyForm.ncs_family_reference_phone = document.getElementById('f-ncsref-phone').value.trim();
  }
  if (step.type === 'church-referral') {
    familyForm.church_affiliation = document.getElementById('f-church').value.trim();
    familyForm.referral_source = document.getElementById('f-referral').value.trim();
  }
  if (step.type === 'emergency') {
    familyForm.emergency_contact_name = document.getElementById('f-ec-name').value.trim();
    familyForm.emergency_contact_relationship = document.getElementById('f-ec-relationship').value.trim();
    familyForm.emergency_contact_phone = document.getElementById('f-ec-phone').value.trim();
  }
  if (step.type === 'agreement') {
    familyForm.agreement_accepted = document.getElementById('f-agreement').checked;
    familyForm.signature_name = document.getElementById('f-signature-name').value.trim();
    familyForm.signature_date = document.getElementById('f-signature-date').value;
  }
}

// ── VALIDATION ───────────────────────────────────────────────
function validateCurrentStep() {
  const step = steps[currentStepIndex];
  if (step.type === 'child-info') {
    saveCurrentStepIntoState();
    if (!children[step.childIndex].student_full_name) return "Please enter this child's full name.";
  }
  return null;
}

// ── SAVE & FINISH LATER / SUBMIT ────────────────────────────
function buildSubmitPayload(isFinal) {
  saveCurrentStepIntoState();
  return {
    p_code: currentCode,
    p_church_affiliation: familyForm.church_affiliation || null,
    p_referral_source: familyForm.referral_source || null,
    p_emergency_contact_name: familyForm.emergency_contact_name || null,
    p_emergency_contact_relationship: familyForm.emergency_contact_relationship || null,
    p_emergency_contact_phone: familyForm.emergency_contact_phone || null,
    p_ncs_family_reference_name: familyForm.ncs_family_reference_name || null,
    p_ncs_family_reference_email: familyForm.ncs_family_reference_email || null,
    p_ncs_family_reference_phone: familyForm.ncs_family_reference_phone || null,
    p_agreement_accepted: familyForm.agreement_accepted,
    p_signature_name: familyForm.signature_name || null,
    p_signature_date: familyForm.signature_date || null,
    p_final: isFinal,
    p_children: children.map(c => ({
      id: c.id,
      student_full_name: c.student_full_name || null,
      nickname: c.nickname || null,
      dob: c.dob || null,
      gender: c.gender || null,
      anticipated_grade: c.anticipated_grade || null,
      previous_schools: c.previous_schools || [],
      last_grade_completed: c.last_grade_completed || null,
      repeated_grade: c.repeated_grade,
      repeated_grade_explain: c.repeated_grade_explain || null,
      disciplinary_history: c.disciplinary_history,
      disciplinary_explain: c.disciplinary_explain || null,
      learning_needs: c.learning_needs,
      learning_needs_explain: c.learning_needs_explain || null,
      medical_notes: c.medical_notes || null
    }))
  };
}

document.getElementById('saveLaterBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveLaterBtn');
  btn.disabled = true; btn.textContent = 'Saving...';
  const payload = buildSubmitPayload(false);
  const { data, error } = await sb.rpc('submit_admission_family_application', payload);
  btn.disabled = false; btn.textContent = 'Save & Finish Later';
  if (error || !data || !data.success) { showToast('Could not save — please try again.'); return; }
  showToast('Progress saved. You can return anytime using your code.', 3000);
  setTimeout(() => { window.location.href = window.location.origin + window.location.pathname; }, 1500);
});

document.getElementById('submitAppBtn').addEventListener('click', async () => {
  const errorEl = document.getElementById('formError');
  errorEl.textContent = '';
  saveCurrentStepIntoState();

  if (!document.getElementById('f-agreement').checked) {
    errorEl.textContent = 'Please expand and read the Statement of Faith, then check the agreement box to continue.';
    return;
  }
  if (!familyForm.signature_name) {
    errorEl.textContent = 'Please type your full name as your signature.';
    return;
  }

  const btn = document.getElementById('submitAppBtn');
  btn.disabled = true; btn.textContent = 'Submitting...';

  const payload = buildSubmitPayload(true);
  const { data, error } = await sb.rpc('submit_admission_family_application', payload);

  btn.disabled = false; btn.textContent = 'Submit Application';

  if (error || !data || !data.success) {
    const reason = data && data.reason;
    errorEl.textContent = reason === 'expired'
      ? 'This application has expired. Please contact the office for help.'
      : reason === 'agreement_required'
        ? 'Please acknowledge the agreement and provide your signature.'
        : 'Something went wrong submitting your application. Please try again.';
    return;
  }

  const thankYouOverlay = document.getElementById('applyThankYouOverlay');
  thankYouOverlay.style.display = 'flex';

  const refreshed = { ...familyData, ...familyForm, children: children.map(c => ({ ...c, decision: 'pending' })), signature_token: data.signature_token, status: 'submitted' };
  showSubmittedScreen(refreshed);

  setTimeout(() => { thankYouOverlay.style.display = 'none'; }, 1900);
});

// ── PRINT / SAVE APPLICATION ─────────────────────────────────
function buildApplicationPrintHTML(family, kids) {
  const yn = (v, explain) => v === true ? 'Yes' + (explain ? ' — ' + esc(explain) : '') : v === false ? 'No' : '—';
  const section = (title, rows) => `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:1.05rem;color:#B07D4F;border-bottom:2px solid #E6E1DC;padding-bottom:6px;margin-bottom:10px;">${title}</h2>
      ${rows}
    </div>`;
  const row = (label, value) => `<div style="display:flex;padding:6px 0;border-bottom:1px solid #f3eee9;font-size:0.9rem;"><div style="width:220px;flex-shrink:0;color:#9a8b84;font-weight:bold;">${label}</div><div style="color:#3A2E2A;">${value || '—'}</div></div>`;

  const childrenSections = kids.map((a, i) => {
    const schools = Array.isArray(a.previous_schools) ? a.previous_schools : [];
    return section(`Child ${i + 1}: ${esc(a.student_full_name || 'Student')}`,
      row('Nickname', esc(a.nickname)) + row('Date of Birth', esc(a.dob)) + row('Gender', esc(a.gender)) +
      row('Anticipated Grade', esc(a.anticipated_grade)) +
      (schools.length ? schools.map(s => row('Previous School', esc([s.name, s.city, s.state].filter(Boolean).join(', ')))).join('') : row('Previous Schools', 'None listed')) +
      row('Last Grade Completed', esc(a.last_grade_completed)) +
      row('Repeated a Grade', yn(a.repeated_grade, a.repeated_grade_explain)) +
      row('Disciplinary History', yn(a.disciplinary_history, a.disciplinary_explain)) +
      row('Learning Needs / IEP / 504', yn(a.learning_needs, a.learning_needs_explain)) +
      row('Medical Notes', esc(a.medical_notes))
    );
  }).join('');

  return `
    ${childrenSections}
    ${section('Parent / Guardian',
      row('Parent 1', esc([family.parent1_name, family.parent1_email, formatPhoneDisplay(family.parent1_phone)].filter(Boolean).join(' · '))) +
      (family.parent2_name ? row('Parent 2', esc([family.parent2_name, family.parent2_email, formatPhoneDisplay(family.parent2_phone)].filter(Boolean).join(' · '))) : '')
    )}
    ${section('Church & Referral', row('Church Affiliation', esc(family.church_affiliation)) + row('How They Heard About NCS', esc(family.referral_source)))}
    ${section('Emergency Contact',
      row('Name', esc(family.emergency_contact_name)) + row('Relationship', esc(family.emergency_contact_relationship)) + row('Phone', esc(formatPhoneDisplay(family.emergency_contact_phone)))
    )}
    ${section('Agreement',
      row('Statement of Faith Agreement', family.agreement_accepted ? 'Agreed' : 'Not agreed') +
      row('Parent Signature', esc(family.signature_name)) + row('Date', esc(family.signature_date))
    )}
    ${renderSignatureStamp(family)}
  `;
}

function openApplicationPrintWindow(title, bodyHTML) {
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${title} — NCS</title>
  <style>
    *{ box-sizing:border-box; margin:0; padding:0; }
    body{ font-family:Arial,sans-serif; color:#3A2E2A; padding:32px; }
    .print-header{ text-align:center; margin-bottom:32px; border-bottom:3px solid #C8102E; padding-bottom:20px; }
    .print-header img{ height:80px; margin-bottom:12px; }
    .print-header h1{ font-size:1.5rem; color:#C8102E; margin-bottom:4px; }
    .print-header p{ font-size:0.85rem; color:#888; }
    .print-footer{ margin-top:40px; text-align:center; font-size:0.78rem; color:#aaa; border-top:1px solid #E6E1DC; padding-top:16px; }
    @media print{ body{ padding:16px; } }
  </style>
</head>
<body>
  <div class="print-header">
    <img src="https://apply.northridgecommunityschool.com/img/logo.png" alt="NCS Logo">
    <h1>Northridge Community School</h1>
    <p>${title} · Generated ${new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
  </div>
  ${bodyHTML}
  <div class="print-footer">
    Northridge Community School · Where Godly Character meets Great Academics · www.northridgecommunityschool.com
  </div>
</body>
</html>`);
  win.document.close();
  setTimeout(() => win.print(), 800);
}

document.getElementById('printApplicationBtn').addEventListener('click', () => {
  if (!familyData) { showToast('Application data not available.'); return; }
  const family = { ...familyData, ...familyForm };
  const kids = children.length ? children : (familyData.children || []);
  openApplicationPrintWindow('Family Admission Application', buildApplicationPrintHTML(family, kids));
});

init();
