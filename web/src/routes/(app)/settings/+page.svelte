<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import TopBar from '$lib/components/TopBar.svelte';
  import IconButton from '$lib/components/IconButton.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Label from '$lib/components/Label.svelte';
  import Button from '$lib/components/Button.svelte';
  import Toggle from '$lib/components/Toggle.svelte';
  import NumField from '$lib/components/NumField.svelte';
  import { store } from '$lib/store.svelte';
  import { auth } from '$lib/auth.svelte';
  import { api, apiEnabled } from '$lib/api';
  import { DEFAULT_CLAUDE_MODEL, describeClaudeError, getClaudeKey, listClaudeModels, setClaudeKey } from '$lib/anthropic';
  import { disablePush, enablePush, pushStatus, sendTestPush, type PushStatus } from '$lib/push';

  // ---- AI ----
  let provider = $state(store.settings.aiProvider);
  let model = $state(store.settings.aiModel);
  let bedrockModels = $state<{ id: string; name: string; provider: string }[] | null>(null);
  let bedrockError = $state<string | null>(null);
  let claudeKey = $state(getClaudeKey());
  let keyInput = $state('');
  let claudeModels = $state<{ id: string; name: string }[] | null>(null);
  let claudeError = $state<string | null>(null);
  let aiSaved = $state(false);

  async function loadBedrock() {
    bedrockError = null;
    try { bedrockModels = (await api.aiModels()).models; }
    catch (e) { bedrockError = `Couldn't load Bedrock models: ${(e as Error).message}`; bedrockModels = []; }
  }
  async function loadClaude() {
    if (!claudeKey) return;
    claudeError = null; claudeModels = null;
    try { claudeModels = await listClaudeModels(claudeKey); }
    catch (e) { claudeError = await describeClaudeError(e); claudeModels = []; }
  }
  $effect(() => { if (provider === 'bedrock' && !bedrockModels && apiEnabled) loadBedrock(); });
  $effect(() => { if (provider === 'anthropic' && claudeKey && !claudeModels) loadClaude(); });

  function pickProvider(p: 'bedrock' | 'anthropic') {
    if (provider === p) return;
    provider = p;
    model = p === 'anthropic' ? DEFAULT_CLAUDE_MODEL : (bedrockModels?.[0]?.id ?? null);
  }
  async function saveKey() {
    setClaudeKey(keyInput);
    claudeKey = keyInput.trim(); keyInput = ''; claudeModels = null;
    await loadClaude();
  }
  function removeKey() { setClaudeKey(''); claudeKey = ''; claudeModels = null; }
  async function saveAi() {
    await store.saveSettings({ aiProvider: provider, aiModel: model }).catch(() => {});
    aiSaved = true; setTimeout(() => (aiSaved = false), 2000);
  }
  const bedrockByProvider = $derived.by(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    (bedrockModels ?? []).forEach((x) => m.set(x.provider, [...(m.get(x.provider) ?? []), x]));
    return [...m.entries()];
  });

  // ---- Reminders ----
  let r = $state({ ...store.settings.reminders });
  let pStatus = $state<PushStatus>('unsupported');
  let pushBusy = $state(false);
  let pushMsg = $state<string | null>(null);
  onMount(() => { pStatus = pushStatus(); });

  const slots = $derived.by(() => {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const out: string[] = [];
    for (let m = toMin(r.start); m <= toMin(r.end); m += r.everyHours * 60) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    return out;
  });

  async function toggleReminders(on: boolean) {
    pushMsg = null; pushBusy = true;
    try {
      if (on) {
        const st = await enablePush();
        pStatus = st;
        if (st !== 'granted') { r.enabled = false; pushMsg = statusHelp(st); return; }
      } else {
        await disablePush();
      }
      r.enabled = on;
      await saveReminders();
    } catch (e) {
      r.enabled = false; pushMsg = `Couldn't set up notifications: ${(e as Error).message}`;
    } finally { pushBusy = false; }
  }
  async function saveReminders() {
    r.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || r.timezone;
    if (r.start > r.end) { pushMsg = 'Start time must be before end time.'; return; }
    await store.saveSettings({ reminders: $state.snapshot(r) }).catch(() => {});
  }
  async function test() {
    pushMsg = null; pushBusy = true;
    try {
      const { delivered } = await sendTestPush();
      pushMsg = delivered ? 'Test sent. It should appear in a few seconds.' : 'No device is subscribed yet. Turn reminders off and on again.';
    } catch (e) { pushMsg = (e as Error).message; } finally { pushBusy = false; }
  }
  function statusHelp(s: PushStatus) {
    switch (s) {
      case 'denied': return 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.';
      case 'needs-install': return 'On iPhone, add this app to your Home Screen (Share → Add to Home Screen), open it from there, then turn reminders on.';
      case 'unsupported': return "This browser doesn't support push notifications.";
      default: return 'Permission was not granted.';
    }
  }

  // ---- Weight goal ----
  let goal = $state(store.settings.weightGoalKg ?? store.weights.at(-1)?.kg ?? 75);
  let hasGoal = $state(store.settings.weightGoalKg != null);
  let goalSaved = $state(false);
  async function saveGoal() {
    await store.saveSettings({ weightGoalKg: hasGoal ? Math.round(goal * 10) / 10 : null }).catch(() => {});
    goalSaved = true; setTimeout(() => (goalSaved = false), 2000);
  }
</script>

<TopBar title="Settings" subtitle={auth.user?.email?.toUpperCase() ?? 'PREFERENCES'}>
  {#snippet left()}<IconButton icon="chev-l" label="Back" onclick={() => history.length > 1 ? history.back() : goto('/')} />{/snippet}
</TopBar>

<div class="page">
  <!-- AI coach -->
  <section class="card sec" id="ai">
    <div class="head"><Icon name="flame" size={14} /><Label>AI coach</Label></div>
    <p class="muted">Get feedback on a day's training from the Log screen.</p>
    <div class="choice">
      <button class:on={provider === 'bedrock'} onclick={() => pickProvider('bedrock')} disabled={!apiEnabled}>
        <span class="cond">Amazon Bedrock</span><span class="sub">Runs in this app's AWS account</span>
      </button>
      <button class:on={provider === 'anthropic'} onclick={() => pickProvider('anthropic')}>
        <span class="cond">Claude</span><span class="sub">Your own Anthropic API key</span>
      </button>
    </div>

    {#if provider === 'bedrock'}
      {#if bedrockError}<p class="err">{bedrockError}</p>{/if}
      {#if !bedrockModels}
        <p class="muted">Loading available models…</p>
      {:else if bedrockModels.length}
        <label class="field"><Label>Model</Label>
          <select bind:value={model}>
            {#each bedrockByProvider as [prov, list] (prov)}
              <optgroup label={prov}>{#each list as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</optgroup>
            {/each}
          </select>
        </label>
        <p class="fine">Only models this account can use right now. Claude models are available through your own key instead.</p>
      {:else if !bedrockError}
        <p class="muted">No Bedrock models are available in this account's region.</p>
      {/if}
    {:else if provider === 'anthropic'}
      {#if claudeKey}
        <div class="keyrow">
          <Label size={9} color="var(--text-low)">Key saved on this device · ••••{claudeKey.slice(-4)}</Label>
          <button class="link" onclick={removeKey}>Remove</button>
        </div>
        {#if claudeError}<p class="err">{claudeError}</p>{/if}
        {#if claudeModels?.length}
          <label class="field"><Label>Model</Label>
            <select bind:value={model}>
              {#each claudeModels as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
            </select>
          </label>
        {:else if !claudeModels}
          <p class="muted">Checking your key…</p>
        {/if}
      {:else}
        <label class="field"><Label>Anthropic API key</Label>
          <input type="password" bind:value={keyInput} placeholder="sk-ant-…" autocomplete="off" spellcheck="false" />
        </label>
        <Button full variant="secondary" disabled={!keyInput.trim()} onclick={saveKey}>Save key</Button>
      {/if}
      <p class="fine">Your key is stored only in this browser and sent only to Anthropic, never to this app's server. Create one at console.anthropic.com.</p>
    {/if}

    {#if provider}
      <Button full onclick={saveAi} disabled={!model || (provider === 'anthropic' && !claudeKey)}>{aiSaved ? 'Saved' : 'Save AI settings'}</Button>
    {/if}
  </section>

  <!-- Reminders -->
  <section class="card sec" id="reminders">
    <div class="head"><Icon name="timer" size={14} /><Label>Routine reminders</Label><span style="flex:1"></span>
      <Toggle on={r.enabled} onchange={(v) => toggleReminders(v)} disabled={pushBusy || !apiEnabled} label="Routine reminders" />
    </div>
    <p class="muted">Get a notification on this device at set times of the day.</p>
    {#if pushMsg}<p class="err" class:ok={pushMsg.startsWith('Test sent')}>{pushMsg}</p>{/if}
    {#if pStatus === 'needs-install' && !r.enabled}<p class="fine">{statusHelp('needs-install')}</p>{/if}

    <div class="grid2">
      <label class="field"><Label>From</Label><input type="time" bind:value={r.start} onchange={saveReminders} /></label>
      <label class="field"><Label>Until</Label><input type="time" bind:value={r.end} onchange={saveReminders} /></label>
    </div>
    <label class="field"><Label>Every</Label>
      <select bind:value={r.everyHours} onchange={saveReminders}>
        {#each [1, 2, 3, 4, 6, 8, 12] as h}<option value={h}>{h} hour{h > 1 ? 's' : ''}</option>{/each}
      </select>
    </label>
    <div class="between">
      <div><div class="opt">Only when a routine is pending</div><Label size={9} color="var(--text-low)">Skip rest days and finished workouts</Label></div>
      <Toggle on={r.onlyWhenDue} onchange={(v) => { r.onlyWhenDue = v; saveReminders(); }} label="Only when a routine is pending" />
    </div>
    <div class="slots">
      {#each slots as s}<span>{s}</span>{/each}
    </div>
    <Label size={9} color="var(--text-low)">Times in {r.timezone}</Label>
    {#if r.enabled}<Button full variant="secondary" disabled={pushBusy} onclick={test}>Send a test notification</Button>{/if}
  </section>

  <!-- Weight goal -->
  <section class="card sec" id="weight">
    <div class="head"><Icon name="trophy" size={14} /><Label>Weight goal</Label><span style="flex:1"></span>
      <Toggle bind:on={hasGoal} label="Use a weight goal" />
    </div>
    {#if hasGoal}<NumField label="Target body weight" bind:value={goal} suffix="kg" step={0.5} />{/if}
    <Button full variant="secondary" onclick={saveGoal}>{goalSaved ? 'Saved' : 'Save goal'}</Button>
  </section>

  <!-- Account -->
  <section class="card sec">
    <div class="head"><Label>Account</Label></div>
    <div class="between">
      <div class="opt">Theme</div>
      <button class="mini-btn" onclick={() => store.toggleTheme()}><Icon name={store.theme === 'dark' ? 'sun' : 'moon'} size={12} /> {store.theme === 'dark' ? 'Light' : 'Dark'}</button>
    </div>
    {#if apiEnabled}
      <Button full variant="danger" icon="logout" onclick={() => { auth.logout(); goto('/login'); }}>Sign out</Button>
    {/if}
  </section>
</div>

<style>
  .page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
  .sec { scroll-margin-top: 90px; }
  .sec:target { border-color: var(--border-hi); box-shadow: 0 0 0 1px var(--border-hi); }
  .sec { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; align-items: center; gap: 8px; }
  .muted { margin: 0; font-family: var(--f-sans); font-size: 13px; color: var(--text-mid); line-height: 1.5; }
  .fine { margin: 0; font-family: var(--f-sans); font-size: 11px; color: var(--text-low); line-height: 1.5; }
  .err { margin: 0; font-family: var(--f-sans); font-size: 12px; color: var(--danger); line-height: 1.5; }
  .err.ok { color: var(--text-mid); }
  .choice { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .choice button { padding: 12px; background: transparent; border: 1px solid var(--border); color: var(--text); border-radius: 10px; cursor: pointer;
    text-align: left; display: flex; flex-direction: column; gap: 2px; }
  .choice button.on { background: var(--surface-hi); border-color: var(--border-hi); }
  .choice button:disabled { opacity: 0.4; cursor: default; }
  .choice .cond { font-size: 15px; }
  .sub { font-family: var(--f-sans); font-size: 11px; color: var(--text-mid); }
  .field { display: flex; flex-direction: column; gap: 6px; }
  select, input { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 11px 12px; color: var(--text);
    font-family: var(--f-sans); font-size: 14px; color-scheme: inherit; width: 100%; }
  .keyrow { display: flex; justify-content: space-between; align-items: center; }
  .link { background: none; border: none; color: var(--danger); font-family: var(--f-mono); font-size: 10px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .between { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .opt { font-family: var(--f-sans); font-size: 14px; color: var(--text); }
  .slots { display: flex; flex-wrap: wrap; gap: 6px; }
  .slots span { padding: 4px 8px; border-radius: 6px; background: var(--surface-hi); border: 1px solid var(--border); font-family: var(--f-mono); font-size: 11px; color: var(--text); }
</style>
