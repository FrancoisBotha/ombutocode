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
            class="field-input"
          />
        </div>

        <div class="field">
          <label class="field-label" for="job-source">Source path</label>
          <div class="field-row">
            <input
              id="job-source"
              v-model="form.source_path"
              type="text"
              class="field-input field-input--grow"
            />
            <button type="button" class="btn btn--secondary" @click="browseSource">
              Browse…
            </button>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="job-target">Dropbox target</label>
          <input
            id="job-target"
            v-model="form.dropbox_target"
            type="text"
            class="field-input"
            @input="targetManuallyEdited = true"
          />
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
              class="field-input field-input--narrow"
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

      <div class="form-actions">
        <button type="button" class="btn btn--secondary" @click="handleCancel">
          Cancel
        </button>
        <button type="submit" class="btn btn--primary">
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
      form: {
        name: '',
        source_path: '',
        dropbox_target: '',
        strict_checksum: false,
        mirror_deletes: false
      }
    }
  },

  watch: {
    'form.name'(newName) {
      if (!this.targetManuallyEdited) {
        const slug = newName.trim() || ''
        this.form.dropbox_target = slug ? `/DropSync/${slug}` : ''
      }
    }
  },

  async created() {
    const id = this.$route.params.id
    if (id) {
      this.isEditMode = true
      await this.loadJob(id)
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
    },

    async browseSource() {
      const result = await window.api.jobs.pickSourceFolder()
      if (result && result.ok && result.data) {
        this.form.source_path = result.data
      }
    },

    async handleSave() {
      const intervalMinutes =
        this.intervalUnit === 'hours'
          ? this.intervalValue * 60
          : this.intervalValue

      const payload = {
        name: this.form.name,
        source_path: this.form.source_path,
        dropbox_target: this.form.dropbox_target,
        interval_minutes: intervalMinutes,
        strict_checksum: this.form.strict_checksum,
        mirror_deletes: this.form.mirror_deletes
      }

      if (this.isEditMode) {
        await window.api.jobs.update(this.$route.params.id, payload)
      } else {
        await window.api.jobs.create(payload)
      }

      this.$router.back()
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

.btn--primary {
  background-color: var(--color-primary);
  color: #ffffff;
}

.btn--primary:hover {
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

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-unit);
  padding-top: var(--space-section);
  border-top: 1px solid var(--color-border);
}
</style>
