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

function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function showOnly(id) {
  ['loadingScreen','codeScreen','decidedScreen','submittedScreen','applicationForm'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.style.display = (sid === id) ? (sid === 'applicationForm' ? 'block' : 'block') : 'none';
  });
}

document.getElementById('f-grade').innerHTML = '<option value="">— Select Grade —</option>' +
  GRADE_OPTIONS.map(g => `<option value="${g}">${g}</option>`).join('');

// ── STATE ────────────────────────────────────────────────────
let currentCode = null;
let currentStep = 1;
const TOTAL_STEPS = 4;
let schoolRowCount = 0;
let siblingRowCount = 0;

// ── CODE HANDLING (URL param or manual entry) ──────────────────
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

  const { data, error } = await sb.rpc('validate_admission_code', { p_code: code });

  if (error || !data || !data.valid) {
    showOnly('codeScreen');
    document.getElementById('codeError').textContent =
      (data && data.reason === 'expired')
        ? 'This code has expired. Please contact the office for help.'
        : 'That code was not found. Please check it and try again.';
    return;
  }

  currentCode = code.trim().toUpperCase();

  // Already decided — show outcome instead of the form
  if (['accepted','waitlisted','declined'].includes(data.status)) {
    showDecidedScreen(data);
    return;
  }

  if (data.status === 'submitted') {
    document.getElementById('submittedStudentName').textContent = data.student_full_name || 'your student';
    showOnly('submittedScreen');
    return;
  }

  prefillForm(data);
  showOnly('applicationForm');
  goToStep(1);
}

function showDecidedScreen(data) {
  const badge = document.getElementById('decidedBadge');
  const title = document.getElementById('decidedTitle');
  const msg = document.getElementById('decidedMessage');
  badge.className = 'apply-status-badge ' + data.status;
  if (data.status === 'accepted') {
    badge.textContent = 'Admitted';
    title.textContent = 'Congratulations!';
    msg.textContent = `${data.student_full_name || 'Your student'} has been admitted to Northridge Community School. Our office will follow up by email with next steps.`;
  } else if (data.status === 'waitlisted') {
    badge.textContent = 'Waitlisted';
    title.textContent = 'You\'re on the Waitlist';
    msg.textContent = `${data.student_full_name || 'Your student'} has been placed on our waitlist. We'll reach out if a spot becomes available.`;
  } else {
    badge.textContent = 'Decision Made';
    title.textContent = 'Thank You for Applying';
    msg.textContent = 'A decision has already been made on this application. Please check your email, or contact the office with any questions.';
  }
  showOnly('decidedScreen');
}

// ── PREFILL ──────────────────────────────────────────────────
function prefillForm(data) {
  document.getElementById('f-student-name').value = data.student_full_name || '';
  document.getElementById('f-nickname').value = data.nickname || '';
  document.getElementById('f-age').value = data.age || '';
  document.getElementById('f-dob').value = data.dob || '';
  document.getElementById('f-gender').value = data.gender || '';
  document.getElementById('f-grade').value = data.anticipated_grade || '';
  document.getElementById('f-last-grade').value = data.last_grade_completed || '';
  document.getElementById('f-medical').value = data.medical_notes || '';
  document.getElementById('f-church').value = data.church_affiliation || '';
  document.getElementById('f-referral').value = data.referral_source || '';
  document.getElementById('f-ec-name').value = data.emergency_contact_name || '';
  document.getElementById('f-ec-relationship').value = data.emergency_contact_relationship || '';
  document.getElementById('f-ec-phone').value = data.emergency_contact_phone || '';

  setYesNo('repeatedGradeToggle', data.repeated_grade);
  document.getElementById('f-repeated-explain').value = data.repeated_grade_explain || '';
  toggleExplainWrap('repeatedGradeExplainWrap', data.repeated_grade === true);

  setYesNo('disciplinaryToggle', data.disciplinary_history);
  document.getElementById('f-disciplinary-explain').value = data.disciplinary_explain || '';
  toggleExplainWrap('disciplinaryExplainWrap', data.disciplinary_history === true);

  setYesNo('learningNeedsToggle', data.learning_needs);
  document.getElementById('f-learning-explain').value = data.learning_needs_explain || '';
  toggleExplainWrap('learningNeedsExplainWrap', data.learning_needs === true);

  const schools = Array.isArray(data.previous_schools) ? data.previous_schools : [];
  document.getElementById('schoolsContainer').innerHTML = '';
  if (schools.length === 0) addSchoolRow();
  else schools.forEach(s => addSchoolRow(s));

  const siblings = Array.isArray(data.siblings) ? data.siblings : [];
  document.getElementById('siblingsContainer').innerHTML = '';
  siblings.forEach(s => addSiblingRow(s));
}

function setYesNo(groupId, value) {
  const group = document.getElementById(groupId);
  group.querySelectorAll('button').forEach(btn => {
    const btnVal = btn.dataset.value === 'true';
    btn.classList.toggle('selected', value === btnVal);
  });
}

function toggleExplainWrap(id, show) {
  document.getElementById(id).style.display = show ? 'block' : 'none';
}

// ── STATEMENT OF FAITH ACCORDION ────────────────────────────
// Parent must expand and view this before the agreement checkbox unlocks.
document.getElementById('sofAccordionToggle').addEventListener('click', () => {
  const accordion = document.getElementById('sofAccordion');
  const isOpen = accordion.classList.toggle('open');
  document.getElementById('sofAccordionArrow').textContent = isOpen ? '▲' : '▾';
  document.getElementById('f-agreement').disabled = false;
});

// ── YES/NO TOGGLES ───────────────────────────────────────────
[
  { group: 'repeatedGradeToggle', wrap: 'repeatedGradeExplainWrap' },
  { group: 'disciplinaryToggle', wrap: 'disciplinaryExplainWrap' },
  { group: 'learningNeedsToggle', wrap: 'learningNeedsExplainWrap' }
].forEach(({ group, wrap }) => {
  document.getElementById(group).querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`#${group} button`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      toggleExplainWrap(wrap, btn.dataset.value === 'true');
    });
  });
});

function getYesNoValue(groupId) {
  const selected = document.querySelector(`#${groupId} button.selected`);
  if (!selected) return null;
  return selected.dataset.value === 'true';
}

// ── REPEATABLE ROWS: PREVIOUS SCHOOLS ───────────────────────
function addSchoolRow(prefill) {
  schoolRowCount++;
  const id = schoolRowCount;
  const div = document.createElement('div');
  div.className = 'apply-repeat-row';
  div.dataset.rowId = id;
  div.innerHTML = `
    <button type="button" class="apply-repeat-remove" onclick="this.closest('.apply-repeat-row').remove()">Remove</button>
    <div class="apply-row">
      <div class="apply-field"><label>School Name</label><input type="text" class="school-name" value="${esc(prefill && prefill.name || '')}"></div>
      <div class="apply-field"><label>City</label><input type="text" class="school-city" value="${esc(prefill && prefill.city || '')}"></div>
    </div>
    <div class="apply-row single">
      <div class="apply-field"><label>State</label><input type="text" class="school-state" value="${esc(prefill && prefill.state || '')}"></div>
    </div>`;
  document.getElementById('schoolsContainer').appendChild(div);
}
document.getElementById('addSchoolBtn').addEventListener('click', () => addSchoolRow());

function collectSchools() {
  return Array.from(document.querySelectorAll('#schoolsContainer .apply-repeat-row')).map(row => ({
    name: row.querySelector('.school-name').value.trim(),
    city: row.querySelector('.school-city').value.trim(),
    state: row.querySelector('.school-state').value.trim()
  })).filter(s => s.name || s.city || s.state);
}

// ── REPEATABLE ROWS: SIBLINGS ────────────────────────────────
function addSiblingRow(prefill) {
  siblingRowCount++;
  const id = siblingRowCount;
  const div = document.createElement('div');
  div.className = 'apply-repeat-row';
  div.dataset.rowId = id;
  div.innerHTML = `
    <button type="button" class="apply-repeat-remove" onclick="this.closest('.apply-repeat-row').remove()">Remove</button>
    <div class="apply-row">
      <div class="apply-field"><label>Sibling Name</label><input type="text" class="sibling-name" value="${esc(prefill && prefill.name || '')}"></div>
      <div class="apply-field"><label>Age</label><input type="number" class="sibling-age" min="0" max="25" value="${esc(prefill && prefill.age || '')}"></div>
    </div>`;
  document.getElementById('siblingsContainer').appendChild(div);
}
document.getElementById('addSiblingBtn').addEventListener('click', () => addSiblingRow());

function collectSiblings() {
  return Array.from(document.querySelectorAll('#siblingsContainer .apply-repeat-row')).map(row => ({
    name: row.querySelector('.sibling-name').value.trim(),
    age: row.querySelector('.sibling-age').value.trim()
  })).filter(s => s.name || s.age);
}

// ── STEP NAVIGATION ──────────────────────────────────────────
function goToStep(step) {
  currentStep = step;
  document.querySelectorAll('.apply-step').forEach(el => {
    el.style.display = (parseInt(el.dataset.step, 10) === step) ? 'block' : 'none';
  });
  document.querySelectorAll('.apply-step-dot').forEach(dot => {
    const dotStep = parseInt(dot.dataset.step, 10);
    dot.classList.toggle('active', dotStep === step);
    dot.classList.toggle('done', dotStep < step);
  });
  document.getElementById('prevStepBtn').style.display = step > 1 ? 'block' : 'none';
  document.getElementById('nextStepBtn').style.display = step < TOTAL_STEPS ? 'block' : 'none';
  document.getElementById('submitAppBtn').style.display = step === TOTAL_STEPS ? 'block' : 'none';
  document.getElementById('formError').textContent = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('nextStepBtn').addEventListener('click', () => {
  if (currentStep === 1 && !document.getElementById('f-student-name').value.trim()) {
    document.getElementById('formError').textContent = 'Please enter the student\'s full name.';
    return;
  }
  if (currentStep < TOTAL_STEPS) goToStep(currentStep + 1);
});
document.getElementById('prevStepBtn').addEventListener('click', () => {
  if (currentStep > 1) goToStep(currentStep - 1);
});

// ── COLLECT FORM DATA ────────────────────────────────────────
function collectFormPayload() {
  return {
    p_code: currentCode,
    p_student_full_name: document.getElementById('f-student-name').value.trim(),
    p_nickname: document.getElementById('f-nickname').value.trim() || null,
    p_age: document.getElementById('f-age').value ? parseInt(document.getElementById('f-age').value, 10) : null,
    p_dob: document.getElementById('f-dob').value || null,
    p_gender: document.getElementById('f-gender').value || null,
    p_anticipated_grade: document.getElementById('f-grade').value || null,
    p_previous_schools: collectSchools(),
    p_last_grade_completed: document.getElementById('f-last-grade').value.trim() || null,
    p_repeated_grade: getYesNoValue('repeatedGradeToggle'),
    p_repeated_grade_explain: document.getElementById('f-repeated-explain').value.trim() || null,
    p_disciplinary_history: getYesNoValue('disciplinaryToggle'),
    p_disciplinary_explain: document.getElementById('f-disciplinary-explain').value.trim() || null,
    p_learning_needs: getYesNoValue('learningNeedsToggle'),
    p_learning_needs_explain: document.getElementById('f-learning-explain').value.trim() || null,
    p_medical_notes: document.getElementById('f-medical').value.trim() || null,
    p_siblings: collectSiblings(),
    p_church_affiliation: document.getElementById('f-church').value.trim() || null,
    p_referral_source: document.getElementById('f-referral').value.trim() || null,
    p_emergency_contact_name: document.getElementById('f-ec-name').value.trim() || null,
    p_emergency_contact_relationship: document.getElementById('f-ec-relationship').value.trim() || null,
    p_emergency_contact_phone: document.getElementById('f-ec-phone').value.trim() || null,
    p_agreement_accepted: document.getElementById('f-agreement').checked,
    p_signature_name: document.getElementById('f-signature-name').value.trim() || null,
    p_signature_date: document.getElementById('f-signature-date').value || null
  };
}

// ── SAVE & FINISH LATER ──────────────────────────────────────
document.getElementById('saveLaterBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveLaterBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  const payload = collectFormPayload();
  payload.p_final = false;
  const { data, error } = await sb.rpc('submit_admission_application', payload);
  btn.disabled = false;
  btn.textContent = 'Save & Finish Later';
  if (error || !data || !data.success) {
    showToast('Could not save — please try again.');
    return;
  }
  showToast('Progress saved. You can return anytime using your code.', 5000);
});

// ── FINAL SUBMIT ─────────────────────────────────────────────
document.getElementById('applicationForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('formError');
  errorEl.textContent = '';

  if (!document.getElementById('f-agreement').checked) {
    errorEl.textContent = 'Please expand and read the Statement of Faith, then check the agreement box to continue.';
    return;
  }
  if (!document.getElementById('f-signature-name').value.trim()) {
    errorEl.textContent = 'Please type your full name as your signature.';
    return;
  }

  const btn = document.getElementById('submitAppBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  const payload = collectFormPayload();
  payload.p_final = true;
  const { data, error } = await sb.rpc('submit_admission_application', payload);

  btn.disabled = false;
  btn.textContent = 'Submit Application';

  if (error || !data || !data.success) {
    const reason = data && data.reason;
    errorEl.textContent = reason === 'expired'
      ? 'This application has expired. Please contact the office for help.'
      : reason === 'agreement_required'
        ? 'Please acknowledge the agreement and provide your signature.'
        : 'Something went wrong submitting your application. Please try again.';
    return;
  }

  document.getElementById('submittedStudentName').textContent = document.getElementById('f-student-name').value.trim() || 'your student';
  showOnly('submittedScreen');
});

init();
