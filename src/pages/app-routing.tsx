import {
  AddRounded,
  AppsRounded,
  ArrowBackRounded,
  DeleteRounded,
  RefreshRounded,
  SaveRounded,
} from '@mui/icons-material'
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useLockFn } from 'ahooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import { BasePage, Switch } from '@/components/base'
import { useClash } from '@/hooks/use-clash'
import { useVerge } from '@/hooks/use-verge'
import {
  calcuProxies,
  getRuntimeProxyGroupOrder,
  listInstalledApplications,
  resolveApplicationIcon,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

const BUILTIN_POLICIES = ['DIRECT', 'REJECT']
const iconUrlCache = new Map<string, string>()
const iconUrlRequests = new Map<string, Promise<string | undefined>>()

const loadApplicationIcon = (iconPath: string) => {
  const cached = iconUrlCache.get(iconPath)
  if (cached) return Promise.resolve(cached)

  const pending = iconUrlRequests.get(iconPath)
  if (pending) return pending

  const request = resolveApplicationIcon(iconPath)
    .then((resolvedPath) => {
      if (!resolvedPath) return undefined
      const url = convertFileSrc(resolvedPath)
      iconUrlCache.set(iconPath, url)
      return url
    })
    .catch(() => undefined)
    .finally(() => iconUrlRequests.delete(iconPath))
  iconUrlRequests.set(iconPath, request)
  return request
}

const InstalledApplicationIcon = ({
  application,
  size,
}: {
  application: IInstalledApplication
  size: number
}) => {
  const [source, setSource] = useState<string | undefined>(() =>
    application.iconPath ? iconUrlCache.get(application.iconPath) : undefined,
  )

  useEffect(() => {
    const iconPath = application.iconPath
    if (!iconPath) return

    let cancelled = false
    void loadApplicationIcon(iconPath).then((url) => {
      if (!cancelled) setSource(url)
    })
    return () => {
      cancelled = true
    }
  }, [application.iconPath])

  return (
    <Avatar
      variant="rounded"
      src={source}
      sx={{ width: size, height: size, flex: '0 0 auto' }}
    >
      <AppsRounded sx={{ fontSize: Math.round(size * 0.58) }} />
    </Avatar>
  )
}

const isSafeRulePart = (value: string) =>
  value.trim().length > 0 && !/[,\r\n]/u.test(value)

const appKey = (app: IInstalledApplication) => app.bundleId || app.appPath
const ruleKey = (rule: IAppRoutingRule) =>
  rule.bundle_id || rule.process_path || rule.app_name

const toRule = (
  app: IInstalledApplication,
  policy: string,
): IAppRoutingRule => ({
  app_name: app.name,
  bundle_id: app.bundleId,
  process_path: app.executablePath,
  process_names: app.processNames,
  policy,
  enabled: true,
})

interface Props {
  onBack?: () => void
}

const AppRoutingPage = ({ onBack }: Props) => {
  const { t } = useTranslation()
  const { clash } = useClash()
  const { verge, patchVerge } = useVerge()
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(
    () => verge?.enable_app_routing ?? false,
  )
  const [applications, setApplications] = useState<IInstalledApplication[]>([])
  const [policies, setPolicies] = useState(BUILTIN_POLICIES)
  const [rules, setRules] = useState<IAppRoutingRule[]>(
    () => verge?.app_routing_rules ?? [],
  )

  const applicationsByKey = useMemo(
    () => new Map(applications.map((app) => [appKey(app), app])),
    [applications],
  )

  const loadOptions = useCallback(async () => {
    setScanning(true)
    try {
      const [apps, proxyData, runtimeGroupOrder] = await Promise.all([
        listInstalledApplications(),
        calcuProxies().catch(() => null),
        getRuntimeProxyGroupOrder().catch(() => []),
      ])
      setApplications(apps)
      const groupNames = [
        ...runtimeGroupOrder,
        ...(proxyData?.groups.map((group) => group.name) ?? []),
      ].filter(isSafeRulePart)
      setPolicies(Array.from(new Set([...BUILTIN_POLICIES, ...groupNames])))
    } catch (error) {
      showNotice.error(error)
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  const handleSave = useLockFn(async () => {
    const keys = rules.map(ruleKey)
    if (new Set(keys).size !== keys.length) {
      showNotice.error('settings.sections.appRouting.messages.duplicateApp')
      return
    }

    if (rules.some((rule) => !isSafeRulePart(rule.policy))) {
      showNotice.error('settings.sections.appRouting.messages.policyRequired')
      return
    }

    setSaving(true)
    try {
      await patchVerge({
        enable_app_routing: enabled,
        app_routing_rules: rules,
      })
      // Existing TCP/UDP sessions keep their original route until they close.
      // Closing them here makes a newly saved per-app policy observable at once.
      await closeAllConnections().catch(() => {})
      showNotice.success('settings.sections.appRouting.messages.saved')
    } catch (error) {
      showNotice.error(error)
    } finally {
      setSaving(false)
    }
  })

  const addApplication = () => {
    const used = new Set(rules.map(ruleKey))
    const app = applications.find((candidate) => !used.has(appKey(candidate)))
    if (!app) {
      showNotice.info('settings.sections.appRouting.messages.noMoreApps')
      return
    }
    setRules((current) => [
      ...current,
      toRule(
        app,
        policies.find((policy) => !BUILTIN_POLICIES.includes(policy)) ??
          'DIRECT',
      ),
    ])
  }

  return (
    <BasePage
      title={t('settings.sections.appRouting.title')}
      contentStyle={{ overflow: 'auto' }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {onBack && (
            <Button
              variant="text"
              startIcon={<ArrowBackRounded />}
              onClick={onBack}
            >
              {t('rules.page.actions.back')}
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={
              scanning ? <CircularProgress size={16} /> : <RefreshRounded />
            }
            disabled={scanning}
            onClick={() => void loadOptions()}
          >
            {t('settings.sections.appRouting.actions.refresh')}
          </Button>
          <Button
            variant="contained"
            startIcon={
              saving ? (
                <CircularProgress color="inherit" size={16} />
              ) : (
                <SaveRounded />
              )
            }
            disabled={saving || !verge}
            onClick={() => void handleSave()}
          >
            {t('shared.actions.save')}
          </Button>
        </Box>
      }
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 980,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          pb: 2,
          boxSizing: 'border-box',
        }}
      >
        <Alert
          severity={
            verge?.enable_tun_mode && clash?.mode === 'rule'
              ? 'info'
              : 'warning'
          }
          sx={{ mb: 2 }}
        >
          {t(
            !verge?.enable_tun_mode
              ? 'settings.sections.appRouting.messages.tunRequired'
              : clash?.mode !== 'rule'
                ? 'settings.sections.appRouting.messages.ruleModeRequired'
                : 'settings.sections.appRouting.messages.tunActive',
          )}
        </Alert>

        <List disablePadding>
          <ListItem sx={{ px: 0 }}>
            <ListItemText
              primary={t('settings.sections.appRouting.fields.enabled')}
              secondary={t('settings.sections.appRouting.description')}
            />
            <Switch
              checked={enabled}
              onChange={(_, checked) => setEnabled(checked)}
            />
          </ListItem>
        </List>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', my: 1 }}>
          <Typography variant="subtitle2">
            {t('settings.sections.appRouting.fields.routes')}
          </Typography>
          <Button
            size="small"
            startIcon={<AddRounded />}
            disabled={scanning || applications.length === 0}
            onClick={addApplication}
          >
            {t('settings.sections.appRouting.actions.add')}
          </Button>
        </Box>

        {rules.length === 0 ? (
          <Typography
            color="text.secondary"
            sx={{ py: 3, textAlign: 'center' }}
          >
            {t('settings.sections.appRouting.messages.empty')}
          </Typography>
        ) : (
          <List disablePadding>
            {rules.map((rule, index) => {
              const selected =
                applicationsByKey.get(ruleKey(rule)) ??
                ({
                  name: rule.app_name,
                  bundleId: rule.bundle_id,
                  appPath: rule.process_path ?? rule.app_name,
                  executablePath: rule.process_path ?? '',
                  processNames: rule.process_names,
                } satisfies IInstalledApplication)
              const applicationOptions = applicationsByKey.has(ruleKey(rule))
                ? applications
                : [selected, ...applications]
              return (
                <ListItem
                  key={ruleKey(rule)}
                  sx={{ px: 0, gap: 1, alignItems: 'flex-start' }}
                >
                  <Box sx={{ mt: 0.25 }}>
                    <InstalledApplicationIcon
                      application={selected}
                      size={38}
                    />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Autocomplete
                      size="small"
                      options={applicationOptions}
                      value={selected}
                      getOptionLabel={(option) => option.name}
                      isOptionEqualToValue={(option, value) =>
                        appKey(option) === appKey(value)
                      }
                      renderOption={(props, option) => (
                        <Box
                          component="li"
                          {...props}
                          sx={{ display: 'flex', gap: 1 }}
                        >
                          <InstalledApplicationIcon
                            application={option}
                            size={28}
                          />
                          <Typography noWrap>{option.name}</Typography>
                        </Box>
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={t(
                            'settings.sections.appRouting.fields.application',
                          )}
                        />
                      )}
                      onChange={(_, app) => {
                        if (!app) return
                        setRules((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? toRule(app, item.policy)
                              : item,
                          ),
                        )
                      }}
                    />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: 'block',
                        mt: 0.5,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {rule.process_path}
                      {rule.process_names.length > 1
                        ? ` · ${t(
                            'settings.sections.appRouting.messages.helperCount',
                            { count: rule.process_names.length - 1 },
                          )}`
                        : ''}
                    </Typography>
                  </Box>
                  <Autocomplete
                    size="small"
                    sx={{ width: 190 }}
                    options={policies}
                    value={rule.policy}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={t('settings.sections.appRouting.fields.policy')}
                      />
                    )}
                    onChange={(_, policy) => {
                      if (!policy) return
                      setRules((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, policy } : item,
                        ),
                      )
                    }}
                  />
                  <Switch
                    sx={{ mt: 0.5 }}
                    checked={rule.enabled}
                    onChange={(_, checked) =>
                      setRules((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, enabled: checked }
                            : item,
                        ),
                      )
                    }
                  />
                  <IconButton
                    color="error"
                    title={t('shared.actions.delete')}
                    onClick={() =>
                      setRules((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <DeleteRounded />
                  </IconButton>
                </ListItem>
              )
            })}
          </List>
        )}
      </Box>
    </BasePage>
  )
}

export default AppRoutingPage
