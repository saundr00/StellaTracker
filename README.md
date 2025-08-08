# StellaTracker (MVP with Presets, Offline Queue, Delete)

## Features
- Quick presets (+1 Panting, Tylenol 250mg, Assisi Hip 15m, Walk Circle 0.15mi, Accident shortcuts)
- Quick Log with accident location & size, energy slider default 3
- Works offline; failed posts are queued and can be synced later
- Today counts, last-30-day list
- Delete entries
- CSV export

## Deploy (Azure Static Web Apps + Managed Functions)

1) **Storage account + Table (East US 2)** — pick a unique storage name:
```bash
# RG already exists: rg-stella-tracker
STO=ststellatracker$RANDOM
az storage account create -g rg-stella-tracker -n $STO -l eastus2 --sku Standard_LRS
az storage table create --name events --account-name $STO
CONN=$(az storage account show-connection-string -g rg-stella-tracker -n $STO -o tsv)
echo "$CONN"
```

2) **Create GitHub repo & push**
```bash
git init
git add .
git commit -m "StellaTracker MVP (presets + offline + delete)"
git branch -M main
git remote add origin https://github.com/saundr00/StellaTracker.git
git push -u origin main
```

3) **Create Static Web App (Portal)**
- Link repo `saundr00/StellaTracker`, branch `main`
- App location: `web`
- API location: `api`
- Output: *(leave blank)*

4) **Add API settings (in SWA portal → Configuration)**
- `TABLES_CONNECTION_STRING` = value of `$CONN`
- `TABLE_NAME` = `events`
Click **Save** and **Restart** the API.

5) Open your SWA URL, add to phone home screen, start logging.

## Notes
- Public/no-auth. Anyone with the URL could post; add auth later.
- Table partition: `yyyy-mm` (UTC).
