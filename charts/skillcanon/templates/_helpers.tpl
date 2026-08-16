{{/*
Expand the name of the chart.
*/}}
{{- define "skillcanon.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "skillcanon.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Component-qualified names. Only two components exist now: the single
unified Next.js app (built from the root Dockerfile) and Postgres.
*/}}
{{- define "skillcanon.app.fullname" -}}
{{- include "skillcanon.fullname" . }}
{{- end }}

{{- define "skillcanon.database.fullname" -}}
{{- printf "%s-database" (include "skillcanon.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "skillcanon.labels" -}}
helm.sh/chart: {{ include "skillcanon.name" . }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
App (unified Next.js) selector labels
*/}}
{{- define "skillcanon.app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "skillcanon.name" . }}
app.kubernetes.io/component: app
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Database selector labels
*/}}
{{- define "skillcanon.database.selectorLabels" -}}
app.kubernetes.io/name: {{ include "skillcanon.name" . }}
app.kubernetes.io/component: database
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Database host — the chart's own StatefulSet Service when database.enabled,
otherwise the operator-supplied external host.
*/}}
{{- define "skillcanon.database.host" -}}
{{- if .Values.database.enabled }}
{{- include "skillcanon.database.fullname" . }}
{{- else }}
{{- .Values.externalDatabase.host }}
{{- end }}
{{- end }}

{{/*
Database port — the chart's own StatefulSet when database.enabled,
otherwise the operator-supplied external port.
*/}}
{{- define "skillcanon.database.port" -}}
{{- if .Values.database.enabled }}
{{- .Values.database.port }}
{{- else }}
{{- .Values.externalDatabase.port }}
{{- end }}
{{- end }}

{{/*
Database name — the chart's own StatefulSet database when database.enabled,
otherwise the operator-supplied external database name.
*/}}
{{- define "skillcanon.database.name" -}}
{{- if .Values.database.enabled }}
{{- .Values.database.postgresDb }}
{{- else }}
{{- .Values.externalDatabase.database }}
{{- end }}
{{- end }}

{{/*
The three role-scoped Postgres connection strings this app requires
(see docs/context/database-conventions.md and the RLS rollout notes in
CLAUDE.md): a least-privileged, RLS-subject "app" role; a slightly wider
"auth" role used only for pre-tenant-context flows (login, session/API-key
resolution, invitation acceptance, org bootstrap); and a schema-owning
"migration" role used only by `pnpm db:migrate`/`db:generate`, which is
also the role `pnpm db:migrate` uses to CREATE the app/auth roles the
first time it runs against an empty database. Mirrors docker-compose.yaml's
app service env block exactly. Not rendered when
externalDatabase.existingSecret is set — the caller reads directly from
that secret's own keys instead.
*/}}
{{- define "skillcanon.databaseUrl" -}}
postgresql://skillcanon_app:{{ .Values.secrets.appDbPassword }}@{{ include "skillcanon.database.host" . }}:{{ include "skillcanon.database.port" . }}/{{ include "skillcanon.database.name" . }}
{{- end }}

{{- define "skillcanon.authDatabaseUrl" -}}
postgresql://skillcanon_auth:{{ .Values.secrets.authDbPassword }}@{{ include "skillcanon.database.host" . }}:{{ include "skillcanon.database.port" . }}/{{ include "skillcanon.database.name" . }}
{{- end }}

{{- define "skillcanon.migrationDatabaseUrl" -}}
{{- $user := .Values.database.enabled | ternary .Values.database.postgresUser .Values.externalDatabase.migrationUser -}}
postgresql://{{ $user }}:{{ .Values.secrets.postgresPassword }}@{{ include "skillcanon.database.host" . }}:{{ include "skillcanon.database.port" . }}/{{ include "skillcanon.database.name" . }}
{{- end }}
