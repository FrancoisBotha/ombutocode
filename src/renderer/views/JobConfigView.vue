<template>
  <div class="job-config">
    <h1>{{ isEditMode ? 'Edit Backup Job' : 'New Backup Job' }}</h1>

    <form class="job-form" @submit.prevent="handleSave">
      <section class="form-section">
        <h2>Job Details</h2>

        <div class="field">
          <label class="field-label" for="job-name">Name</label>
          <input
            id="job-name"
            v-model="form.name"
            type="text"
            :class="['field-input', { 'field-input--error': shouldShowError('name') }]"
            :aria-invalid="shouldShowError('name')"
            :aria-describedby="shouldShowError('name') ? 'job-name-error' : undefined"
            @blur="markTouched('name')"
          />
          <p v-if="shouldShowError('name')" id="job-name-error" class="field-error">
            {{ errors.name }}
          </p>
        </div>

        <div class="field">
          <label class="field-label" for="job-source">Source path</label>
          <div class="field-row">
            <input
              id="job-source"
              v-model="form.source_path"
              type="text"
              :class="[
                'field-input',
                'field-input--grow',
                { 'field-input--error': shouldShowError('source_path') }
              ]"
              :aria-invalid="shouldShowError('source_path')"
              :aria-describedby="shouldShowError('source_path') ? 'job-source-error' : undefined"
              @blur="markTouched('source_path')"
            />
            <button type="button" class="btn btn--secondary" @click="browseSource">
              Browse…
            </button>
          </div>
          <p v-if="shouldShowError('source_path')" id="job-source-error" class="field-error">
            {{ errors.source_path }}
          </p>
        </div>

        <div class="field">
          <label class="field-label" for="job-target">Dropbox target</label>
          <input
            id="job-target"
            v-model="form.dropbox_target"
            type="text"
            :class="['field-input', { 'field-input--error': shouldShowError('dropbox_target') }]"
            :aria-invalid="shouldShowError('dropbox_target')"
            :aria-describedby="shouldShowError('dropbox_target') ? 'job-target-error' : undefined"
            @input="targetManuallyEdited = true"
            @blur="markTouched('dropbox_target')"
          />
          <p v-if="shouldShowError('dropbox_target')" id="job-target-error" class="field-error">
            {{ errors.dropbox_target }}
          </p>
        </div>
      </section>

      <section class="form-section">
        <h2>Options</h2>

        <div class="field">
          <label class="field-label" for="job-interval">Interval</label>
          <div class="field-row">
            <input
              id="job-interval"
              v-model.number="intervalValue"
              type="number"
              min="1"
              step="1"
              :class="[
                'field-input',
                'field-input--narrow',
                { 'field-input--error': shouldShowError('intervalValue') }
              ]"
              :aria-invalid="shouldShowError('intervalValue')"
              :aria-describedby="shouldShowError('intervalValue') ? 'job-interval-error' : undefined"
              @blur="markTouched('intervalValue')"
            />
            <select
              id="job-interval-unit"
              v-model="intervalUnit"
              class="field-input field-input--unit"
            >
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
            </select>
          </div>
          <p v-if="shouldShowError('intervalValue')" id="job-interval-error" class="field-error">
            {{ errors.intervalValue }}
          </p>
        </div>

        <div class="field field--toggle">
          <div class="toggle-row">
            <label class="toggle">
              <input
                type="checkbox"
                v-model="form.strict_checksum"
                class="toggle-input"
              />
              <span class="toggle-track"><span class="toggle-knob"></span></span>
              <span class="toggle-label">Strict checksum</span>
            </label>
            <p class="field-help">Slower but verifies content hash</p>
          </div>
        </div>

        <div class="field field--toggle">
          <div class="toggle-row">
            <label class="toggle">
              <input
                type="checkbox"
                v-model="form.mirror_deletes"
                class="toggle-input"
              />
              <span class="toggle-track"><span class="toggle-knob"></span></span>
              <span class="toggle-label">Mirror deletes</span>
            </label>
            <p class="field-help field-help--warning">
              When enabled, files deleted locally will also be deleted from Dropbox
            </p>
          </div>
        </div>
      </section>

      <section class="form-section">
        <h2>Exclusion rules</h2>

        <div class="chips-container" v-if="exclusionPatterns.length > 0">
          <span
            class="chip"
            v-for="(pattern, index) in exclusionPatterns"
            :key="pattern"
          >
            <span class="chip-text">{{ pattern }}</span>
            <button
              type="button"
              class="chip-remove"
              @click="removePattern(index)"
              aria-label="Remove pattern"
            >&times;</button>
          </span>
        </div>

        <div class="field">
          <div class="field-row">
            <input
              id="exclusion-input"
              v-model="newPattern"
              type="text"
              class="field-input field-input--grow"
              placeholder="Add a pattern, e.g. *.log"
              @keydown.enter.prevent="addPattern"
            />
            <button type="button" class="btn btn--secondary" @click="addPattern">
              + Add
            </button>
          </div>
          <p v-if="duplicateMessage" class="field-error">{{ duplicateMessage }}</p>
        </div>
      </section>

      <div class="form-actions">
        <button type="button" class="btn btn--secondary" @click="handleCancel">
          Cancel
        </button>
        <button type="submit" class="btn btn--primary" :disabled="!canSave">
          Save
        </button>
      </div>
    </form>
  </div>
</template>

<script>
export default {
  name: 'JobConfigView',

  data() {
    return {
      isEditMode: false,
      targetManuallyEdited: false,
      intervalValue: 30,
      intervalUnit: 'minutes',
      submitAttempted: false,
      touched: {
        name: false,
        source_path: false,
        dropbox_target: false,
        intervalValue: false
      },
      errors: {
        name: '',
        source_path: '',
        dropbox_target: '',
        intervalValue: ''
      },
      serverNameError: {
        value: '',
        name: ''
      },
      form: {
        name: '',
        source_path: '',
        dropbox_target: '',
        strict_checksum: false,
        mirror_deletes: false
      },
      exclusionPatterns: [],
      newPattern: '',
      duplicateMessage: ''
    }
  },

  watch: {
    'form.name'(newName) {
      if (!this.targetManuallyEdited) {
        const slug = newName.trim() || ''
        this.form.dropbox_target = slug ? `/DropSync/${slug}` : ''
      }
    },

    intervalUnit() {
      if (this.touched.intervalValue || this.submitAttempted) {
        this.validateField('intervalValue')
      }
    }
  },

  computed: {
    isClientValid() {
      return Object.values(this.getClientValidation()).every((message) => !message)
    },

    hasActiveServerNameError() {
      return Boolean(
        this.serverNameError.value &&
        this.form.name.trim() === this.serverNameError.name
      )
    },

    canSave() {
      return this.isClientValid && !this.hasActiveServerNameError
    }
  },

  async created() {
    const id = this.$route.params.id
    if (id) {
      this.isEditMode = true
      await this.loadJob(id)
    } else {
      await this.loadDefaultPatterns()
    }
  },

  methods: {
    async loadJob(id) {
      const result = await window.api.jobs.get(id)
      if (result && result.ok && result.data) {
        const job = result.data
        this.form.name = job.name || ''
        this.form.source_path = job.source_path || ''
        this.form.dropbox_target = job.dropbox_target || ''
        this.form.strict_checksum = !!job.strict_checksum
        this.form.mirror_deletes = !!job.mirror_deletes

        const totalMinutes = job.interval_minutes || 30
        if (totalMinutes >= 60 && totalMinutes % 60 === 0) {
          this.intervalValue = totalMinutes / 60
          this.intervalUnit = 'hours'
        } else {
          this.intervalValue = totalMinutes
          this.intervalUnit = 'minutes'
        }

        this.targetManuallyEdited = true
      }

      const rulesResult = await window.api.jobs.listExclusionRules(id)
      if (rulesResult && rulesResult.ok && Array.isArray(rulesResult.data)) {
        this.exclusionPatterns = rulesResult.data.map(r => r.pattern)
      }
    },

    async loadDefaultPatterns() {
      const result = await window.api.jobs.listDefaultExclusionPatterns()
      if (result && result.ok && Array.isArray(result.data)) {
        this.exclusionPatterns = result.data.map(r => r.pattern)
      }
    },

    addPattern() {
      const trimmed = this.newPattern.trim()
      if (!trimmed) return

      if (this.exclusionPatterns.includes(trimmed)) {
        this.duplicateMessage = `"${trimmed}" is already in the list`
        return
      }

      this.exclusionPatterns.push(trimmed)
      this.newPattern = ''
      this.duplicateMessage = ''
    },

    removePattern(index) {
      this.exclusionPatterns.splice(index, 1)
      this.duplicateMessage = ''
    },

    async browseSource() {
      const result = await window.api.jobs.pickSourceFolder()
      if (result && result.ok && result.data) {
        this.form.source_path = result.data
        if (this.touched.source_path || this.submitAttempted) {
          this.validateField('source_path')
        }
      }
    },

    async handleSave() {
      this.submitAttempted = true
      this.validateForm()

      if (!this.canSave) {
        return
      }

      const intervalMinutes =
        this.intervalUnit === 'hours'
          ? Number(this.intervalValue) * 60
          : Number(this.intervalValue)

      const payload = {
        name: this.form.name.trim(),
        source_path: this.form.source_path.trim(),
        dropbox_target: this.form.dropbox_target.trim(),
        interval_minutes: intervalMinutes,
        strict_checksum: this.form.strict_checksum,
        mirror_deletes: this.form.mirror_deletes,
        exclusion_patterns: [...this.exclusionPatterns]
      }

      const result = this.isEditMode
        ? await window.api.jobs.update(this.$route.params.id, payload)
        : await window.api.jobs.create(payload)

      if (!result || !result.ok) {
        this.setNameServerError(result?.error || 'Unable to save job')
        return
      }

      this.$router.back()
    },

    getClientValidation() {
      return {
        name: this.form.name.trim() ? '' : 'Name is required',
        source_path: this.form.source_path.trim() ? '' : 'Source path is required',
        dropbox_target: this.form.dropbox_target.trim() ? '' : 'Dropbox target is required',
        intervalValue: this.isPositiveInteger(this.intervalValue)
          ? ''
          : 'Interval must be a positive integer'
      }
    },

    validateField(field) {
      const validation = this.getClientValidation()
      this.errors[field] = validation[field] || ''
    },

    validateForm() {
      this.errors = {
        ...this.errors,
        ...this.getClientValidation()
      }
    },

    shouldShowError(field) {
      if (
        field === 'name' &&
        this.hasActiveServerNameError &&
        this.errors.name === this.serverNameError.value
      ) {
        return true
      }

      return !!this.errors[field] && (this.touched[field] || this.submitAttempted)
    },

    markTouched(field) {
      this.touched[field] = true
      this.validateField(field)
    },

    setNameServerError(message) {
      this.serverNameError = {
        value: message,
        name: this.form.name.trim()
      }
      this.errors.name = message
      this.touched.name = true
    },

    isPositiveInteger(value) {
      const normalized = typeof value === 'string' ? value.trim() : value
      return normalized !== '' && Number.isInteger(Number(normalized)) && Number(normalized) > 0
    },

    handleCancel() {
      this.$router.back()
    }
  }
}
</script>

<style scoped>
.job-config {
  max-width: 560px;
  margin: 0 auto;
}

.job-form {
  margin-top: var(--space-section);
}

.form-section {
  margin-bottom: var(--space-section);
}

.form-section h2 {
  margin-bottom: var(--space-card);
}

.field {
  margin-bottom: var(--space-card);
}

.field-label {
  display: block;
  font-size: var(--font-size-small);
  color: var(--color-muted);
  margin-bottom: 4px;
}

.field-input {
  display: block;
  width: 100%;
  padding: 8px 12px;
  font-family: var(--font-family);
  font-size: var(--font-size-body);
  color: var(--color-text);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  outline: none;
  transition: border-color 0.15s ease;
}

.field-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.15);
}

.field-input--error,
.field-input--error:focus {
  border-color: var(--color-error);
  box-shadow: 0 0 0 2px rgba(209, 69, 69, 0.15);
}

.field-error {
  margin-top: 4px;
  font-size: var(--font-size-small);
  color: var(--color-error);
}

.field-row {
  display: flex;
  gap: var(--space-unit);
  align-items: center;
}

.field-input--grow {
  flex: 1;
}

.field-input--narrow {
  width: 100px;
}

.field-input--unit {
  width: 120px;
}

/* Toggle */
.field--toggle {
  margin-bottom: 12px;
}

.toggle-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: var(--font-size-body);
}

.toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-track {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  background-color: var(--color-border);
  border-radius: 10px;
  transition: background-color 0.2s ease;
  flex-shrink: 0;
}

.toggle-input:checked + .toggle-track {
  background-color: var(--color-primary);
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background-color: var(--color-surface);
  border-radius: 50%;
  transition: transform 0.2s ease;
}

.toggle-input:checked + .toggle-track .toggle-knob {
  transform: translateX(16px);
}

.toggle-label {
  font-weight: var(--font-weight-h3);
}

.field-help {
  font-size: var(--font-size-small);
  color: var(--color-muted);
  margin-left: 46px;
}

.field-help--warning {
  color: var(--color-warning);
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  font-family: var(--font-family);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-h3);
  border-radius: var(--radius);
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.btn--primary {
  background-color: var(--color-primary);
  color: #ffffff;
}

.btn--primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
}

.btn--secondary {
  background-color: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.btn--secondary:hover {
  background-color: var(--color-surface-hover);
}

/* Exclusion rules chips */
.chips-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: var(--space-card);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  background-color: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.chip-text {
  line-height: 1.4;
}

.chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  border-radius: 50%;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.chip-remove:hover {
  color: var(--color-error);
  background-color: rgba(209, 69, 69, 0.1);
}

.field-error {
  font-size: var(--font-size-small);
  color: var(--color-error);
  margin-top: 4px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-unit);
  padding-top: var(--space-section);
  border-top: 1px solid var(--color-border);
}
</style>
