const SUPABASE_URL = 'https://eqgzfrzokhowpedderrb.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxZ3pmcnpva2hvd3BlZGRlcnJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjU4ODIsImV4cCI6MjA5NzIwMTg4Mn0.r94X0ZGSdAO_vtd4dXQKmjdVFtPZ7wSpYeUVzPAkjJo';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const GRADE_OPTIONS = ['TK','Kindergarten','1st Grade','2nd Grade','3rd Grade','4th Grade','5th Grade','6th Grade','7th Grade','8th Grade'];

function formatPhoneInput(e) {
  let v = e.target.value.replace(/\D/g,'').slice(0,10);
  if (v.length >= 7) v = '(' + v.slice(0,3) + ') ' + v.slice(3,6) + '-' + v.slice(6);
  else if (v.length >= 4) v = '(' + v.slice(0,3) + ') ' + v.slice(3);
  else if (v.length > 0) v = '(' + v;
  e.target.value = v;
}
document.getElementById('f-ec-phone').addEventListener('input', formatPhoneInput);
document.getElementById('f-ncsref-phone').addEventListener('input', formatPhoneInput);

const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];
function stateOptionsHTML(selected) {
  return '<option value="">— Select —</option>' +
    US_STATES.map(s => `<option value="${s}"${s === selected ? ' selected' : ''}>${s}</option>`).join('');
}

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Reformats any stored phone value to (000) 000-0000 for display.
function formatPhoneDisplay(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 10) return value;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
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
  const sub = document.getElementById('pageHeaderSub');
  if (sub) sub.style.display = (id === 'codeScreen') ? 'block' : 'none';
}

document.getElementById('f-grade').innerHTML = '<option value="">— Select Grade —</option>' +
  GRADE_OPTIONS.map(g => `<option value="${g}">${g}</option>`).join('');
document.getElementById('f-last-grade').innerHTML = '<option value="">— Select Grade —</option>' +
  GRADE_OPTIONS.map(g => `<option value="${g}">${g}</option>`).join('');

// ── AGE AUTO-CALCULATION FROM DOB ───────────────────────────
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
document.getElementById('f-dob').addEventListener('input', (e) => {
  document.getElementById('f-age').value = calculateAgeFromDob(e.target.value);
});

// ── STATE ────────────────────────────────────────────────────
let currentCode = null;
let lastApplicationData = null;
let currentStep = 1;
const TOTAL_STEPS = 10;
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
    lastApplicationData = data;
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
  window._prefillParentData = {
    parent1_name: data.parent1_name, parent1_email: data.parent1_email, parent1_phone: data.parent1_phone,
    parent2_name: data.parent2_name, parent2_email: data.parent2_email, parent2_phone: data.parent2_phone
  };
  document.getElementById('f-student-name').value = data.student_full_name || '';
  document.getElementById('f-nickname').value = data.nickname || '';
  document.getElementById('f-dob').value = data.dob || '';
  document.getElementById('f-age').value = calculateAgeFromDob(data.dob) || (data.age || '');
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

  document.getElementById('f-ncsref-name').value = data.ncs_family_reference_name || '';
  document.getElementById('f-ncsref-email').value = data.ncs_family_reference_email || '';
  document.getElementById('f-ncsref-phone').value = data.ncs_family_reference_phone || '';
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

// ── REFERENCE UPLOADS (Pastoral, Behavior, Mature Christian, Teacher) ──
// One shared handler for all "Upload Completed ___" file inputs — each is
// tagged with data-ref-type and stored in the shared admission-references
// bucket, then attached to the application via one shared RPC.
document.querySelectorAll('.apply-ref-upload').forEach(input => {
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const refType = input.dataset.refType;
    const statusEl = document.querySelector(`.apply-ref-status[data-ref-type="${refType}"]`);
    if (!file) return;

    if (!currentCode) {
      if (statusEl) statusEl.textContent = 'Something went wrong — please refresh and try again.';
      return;
    }

    if (statusEl) { statusEl.textContent = 'Uploading…'; statusEl.style.color = '#9a8b84'; }

    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${currentCode}/${refType}/${Date.now()}-${cleanName}`;

    const { error: uploadError } = await sb.storage.from('admission-references').upload(path, file);
    if (uploadError) {
      if (statusEl) { statusEl.textContent = 'Upload failed — please try again.'; statusEl.style.color = 'var(--red)'; }
      return;
    }

    const { data, error } = await sb.rpc('attach_admission_reference', { p_code: currentCode, p_reference_type: refType, p_file_path: path });
    if (error || !data || !data.success) {
      if (statusEl) { statusEl.textContent = 'Uploaded, but could not save — please contact the office.'; statusEl.style.color = 'var(--red)'; }
      return;
    }

    if (statusEl) { statusEl.textContent = `Uploaded: ${file.name}`; statusEl.style.color = '#16a34a'; }
  });
});

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
      <div class="apply-field"><label>State</label><select class="school-state">${stateOptionsHTML(prefill && prefill.state)}</select></div>
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
    p_signature_date: document.getElementById('f-signature-date').value || null,
    p_ncs_family_reference_name: document.getElementById('f-ncsref-name').value.trim() || null,
    p_ncs_family_reference_email: document.getElementById('f-ncsref-email').value.trim() || null,
    p_ncs_family_reference_phone: document.getElementById('f-ncsref-phone').value.trim() || null
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
  showToast('Progress saved. You can return anytime using your code.', 3000);
  setTimeout(() => {
    window.location.href = window.location.origin + window.location.pathname;
  }, 1500);
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

  // Build the same shape validate_admission_code returns, so the print
  // function works identically whether printing right after submit or
  // on a later return visit.
  lastApplicationData = {
    student_full_name: payload.p_student_full_name, nickname: payload.p_nickname, age: payload.p_age,
    dob: payload.p_dob, gender: payload.p_gender, anticipated_grade: payload.p_anticipated_grade,
    previous_schools: payload.p_previous_schools, last_grade_completed: payload.p_last_grade_completed,
    repeated_grade: payload.p_repeated_grade, repeated_grade_explain: payload.p_repeated_grade_explain,
    disciplinary_history: payload.p_disciplinary_history, disciplinary_explain: payload.p_disciplinary_explain,
    learning_needs: payload.p_learning_needs, learning_needs_explain: payload.p_learning_needs_explain,
    medical_notes: payload.p_medical_notes, siblings: payload.p_siblings,
    church_affiliation: payload.p_church_affiliation, referral_source: payload.p_referral_source,
    emergency_contact_name: payload.p_emergency_contact_name,
    emergency_contact_relationship: payload.p_emergency_contact_relationship,
    emergency_contact_phone: payload.p_emergency_contact_phone,
    agreement_accepted: payload.p_agreement_accepted, signature_name: payload.p_signature_name,
    signature_date: payload.p_signature_date
  };
  // Parent info isn't collected on this form (it's coordinator-entered), so
  // carry it over from whatever validate_admission_code originally returned.
  if (window._prefillParentData) Object.assign(lastApplicationData, window._prefillParentData);

  showOnly('submittedScreen');
});

// ── PRINT / SAVE APPLICATION AS PDF ─────────────────────────
function buildApplicationPrintHTML(a) {
  const yn = (v, explain) => v === true ? 'Yes' + (explain ? ' — ' + esc(explain) : '') : v === false ? 'No' : '—';
  const schools = Array.isArray(a.previous_schools) ? a.previous_schools : [];
  const siblings = Array.isArray(a.siblings) ? a.siblings : [];
  const section = (title, rows) => `
    <div style="margin-bottom:24px;">
      <h2 style="font-size:1.05rem;color:#B07D4F;border-bottom:2px solid #E6E1DC;padding-bottom:6px;margin-bottom:10px;">${title}</h2>
      ${rows}
    </div>`;
  const row = (label, value) => `<div style="display:flex;padding:6px 0;border-bottom:1px solid #f3eee9;font-size:0.9rem;"><div style="width:220px;flex-shrink:0;color:#9a8b84;font-weight:bold;">${label}</div><div style="color:#3A2E2A;">${value || '—'}</div></div>`;

  return `
    ${section('Student Information',
      row('Full Name', esc(a.student_full_name)) + row('Nickname', esc(a.nickname)) + row('Age', esc(a.age)) +
      row('Date of Birth', esc(a.dob)) + row('Gender', esc(a.gender)) + row('Anticipated Grade', esc(a.anticipated_grade))
    )}
    ${section('School History',
      (schools.length ? schools.map(s => row('Previous School', esc([s.name, s.city, s.state].filter(Boolean).join(', ')))).join('') : row('Previous Schools', 'None listed')) +
      row('Last Grade Completed', esc(a.last_grade_completed)) +
      row('Repeated a Grade', yn(a.repeated_grade, a.repeated_grade_explain)) +
      row('Disciplinary History', yn(a.disciplinary_history, a.disciplinary_explain))
    )}
    ${section('Student Needs',
      row('Learning Needs / IEP / 504', yn(a.learning_needs, a.learning_needs_explain)) + row('Medical Notes', esc(a.medical_notes))
    )}
    ${section('Family Context',
      (siblings.length ? siblings.map(s => row('Sibling', esc([s.name, s.age ? 'Age ' + s.age : ''].filter(Boolean).join(', ')))).join('') : row('Siblings', 'None listed')) +
      row('Church Affiliation', esc(a.church_affiliation)) + row('How They Heard About NCS', esc(a.referral_source))
    )}
    ${section('Parent / Guardian',
      row('Parent 1', esc([a.parent1_name, a.parent1_email, formatPhoneDisplay(a.parent1_phone)].filter(Boolean).join(' · '))) +
      (a.parent2_name ? row('Parent 2', esc([a.parent2_name, a.parent2_email, formatPhoneDisplay(a.parent2_phone)].filter(Boolean).join(' · '))) : '')
    )}
    ${section('Emergency Contact',
      row('Name', esc(a.emergency_contact_name)) + row('Relationship', esc(a.emergency_contact_relationship)) + row('Phone', esc(formatPhoneDisplay(a.emergency_contact_phone)))
    )}
    ${section('Agreement',
      row('Statement of Faith Agreement', a.agreement_accepted ? 'Agreed' : 'Not agreed') +
      row('Parent Signature', esc(a.signature_name)) + row('Date', esc(a.signature_date))
    )}
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
    <img src="https://ncswebmaster.github.io/NCS/logo.png" alt="NCS Logo">
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
  if (!lastApplicationData) { showToast('Application data not available.'); return; }
  openApplicationPrintWindow('Admission Application — ' + (lastApplicationData.student_full_name || 'Applicant'), buildApplicationPrintHTML(lastApplicationData));
});

document.getElementById('decidedBackBtn').addEventListener('click', () => {
  window.location.href = window.location.origin + window.location.pathname;
});

init();
