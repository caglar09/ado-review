# PRD — Azure DevOps PR Review CLI (AI Agent Destekli)

## 1. Ürün Tanımı

**ADO Review CLI**, Azure DevOps API ve Gemini CLI (LLM) kullanarak **Pull Request’leri** otomatik inceleyen, önceden tanımlanmış kurallar + proje kuralları + proje yapısı bilgilerini LLM bağlamına entegre ederek **satır-bazlı yorumlar** üreten profesyonel bir CLI aracıdır.

Bu araç, **AI Agent** tarafından geliştirilecek olup; hem **teknik doğrulama** hem **kurumsal kod standartları** hem de **proje bağlamı** üzerinden inceleme yapar.  
Kullanıcıya **ön onay süreci** sunar ve sadece seçilen bulgular Azure DevOps PR üzerinde yorum olarak paylaşılır.

---

## 2. Amaç

- Lead/Reviewer’ın **PR URL veya ID** vererek **tek komutla** kod inceleme başlatabilmesi.
- LLM incelemesinde **kurallar** (`.yaml/.yml/.json`) ve **proje bilgileri** (`.md`) birlikte bağlam oluşturur.
- Yalnızca **değişen dosyalar ve satırlar** üzerinde çalışarak hızlı ve odaklı inceleme sağlamak.
- **Performans** ve **rate limit** yönetimi ile üretim ortamına uygun çalışmak.
- **Temizlik**, **loglama**, **hata yönetimi** ve **idempotent yorum** desteği ile profesyonel kullanıcı deneyimi sağlamak.

---

## 3. Kapsam

### 3.1 Kapsama Dahil Özellikler
1. **Giriş Biçimleri**  
   - `--pr-url <url>`  
   - `--pr <id>` (+ `--org --project --repo`)
2. **Kurallar & Bağlam**  
   - `.yaml/.yml/.json`: teknik kurallar (pattern, severity, suggestion vb.)  
   - `.md`: proje yapısı, rehberler, kod standartları  
   - Rules + proje kuralları + rehber dosyalar **tek LLM context**’te birleştirilir.
3. **Proje Kuralları**  
   - Tek dosya (`project-rules.yaml`) ile projeye özgü standartlar.
4. **Temp Workspace**  
   - OS’a özel temp klasöründe çalışma  
   - `node_modules/`, `Pods/`, `*.lock` dosyaları hariç tutulur.
5. **PR Diff Kaynağı**  
   - Azure DevOps **Pull Request Iteration Changes** API.
6. **Review Stratejisi**  
   - Toplu veya tekil batch review (heuristic)  
   - Yalnız diff edilmiş hunk’lar LLM’e gönderilir.
7. **Model Seçimi**  
   - Kullanıcı `--model <name>` ile Gemini modelini belirler.
8. **Dosya Seçimi & Filtreleme**  
   - `--include`, `--exclude`, `--files`, `--all-files`
9. **Onay Süreci**  
   - **İnteraktif Onay Sistemi**: Varsayılan olarak kullanıcıdan onay ister
   - **Seçenekler**: [a] Tümünü onayla, [s] Seçici onay, [n] İptal
   - **Seçici Onay**: Her bulguyu tek tek onaylama/reddetme
   - **Otomatik Onay**: `--auto-approve` ile tüm bulguları otomatik gönder
   - **Dry Run**: `--dry-run` ile sadece göster, hiçbirini gönderme
10. **Yorum Gönderme**  
    - Satır-bazlı inline comment  
    - Limit aşılırsa summary comment
11. **Rate Limit Yönetimi**  
    - Batch + sleep  
    - 429/5xx retry + backoff
12. **Loglama & Hata Yönetimi**  
    - Detaylı adım adım log  
    - Maskelenmiş gizli bilgiler  
    - Anlamlı exit kodları
13. **Temizlik**  
    - Çalışma bitiminde temp klasörünün silinmesi (`--keep-workdir` opsiyonel)

### 3.2 Kapsam Dışı
- PR açma/kapatma/merge
- Branch bazlı PR bulma
- Build/test çalıştırma
- Binary üreten işlemler

---

## 4. Kullanıcı Akışı

1. Kullanıcı CLI’ye PR URL veya ID verir.
2. CLI, Azure DevOps API’den PR meta bilgilerini alır.
3. PR’ın source branch’i OS temp klasörüne sparse clone ile kopyalanır.
4. PR Iteration Changes ile yalnız değişen dosyalar/hunk’lar çıkarılır.
5. Rules dosyaları (`.yaml/.yml/.json`) ve rehber dosyalar (`.md`) yüklenir.
6. Tüm kurallar, rehberler ve diff bilgileri **tek bir LLM prompt context**’te birleştirilir.
7. Heuristic ile batch planı yapılır:
   - Küçük PR → toplu review
   - Büyük PR → parça parça review
8. Gemini CLI çağrıları yapılır; bulgular JSON formatında toplanır.
9. Kullanıcıya terminalde detaylı bulgular gösterilir.
10. **İnteraktif Onay Süreci**:
    - Bulgular özeti gösterilir (toplam, severity dağılımı)
    - Kullanıcıya seçenekler sunulur: [a] Tümünü onayla, [s] Seçici onay, [n] İptal
    - Seçici onayda her bulgu tek tek gösterilir ve kullanıcı y/n ile karar verir
    - `--auto-approve` ile bu adım atlanır
    - `--dry-run` ile hiçbir yorum gönderilmez, sadece bulgular gösterilir
11. Onaylanan bulgular Azure DevOps'a satır-bazlı yorumlar olarak eklenir.
12. Opsiyonel: PR status (`pending` → `success`/`failure`)
13. Temp klasörü temizlenir.

---

## 5. Teknik Mimari

### 5.1 Proje Yapısı (Gerçekleştirilmiş)

```
ado-review-cli/
├── src/
│   ├── cli/                 # CLI entry point ve argument parsing
│   │   ├── index.ts         # ✅ CLI entry point (Commander.js)
│   │   └── argsParser.ts    # ✅ Parametre doğrulama ve parsing
│   ├── core/                # Ana business logic
│   │   ├── logger.ts        # ✅ Winston tabanlı loglama sistemi
│   │   ├── errorHandler.ts  # ✅ Hata yönetimi ve exit kodları
│   │   ├── reviewOrchestrator.ts # ✅ Ana orkestrasyon sınıfı
│   │   ├── adoClient.ts     # 🔄 Azure DevOps API wrapper
│   │   ├── gitManager.ts    # 🔄 Clone/checkout/sparse fetch
│   │   ├── diffFetcher.ts   # 🔄 PR Iteration Changes API
│   │   ├── rulesLoader.ts   # 🔄 YAML/JSON + MD birleştirme
│   │   ├── contextBuilder.ts # 🔄 Rules + project rules + MD + diff → LLM prompt
│   │   ├── reviewPlanner.ts # 🔄 Batch/tekil planlama
│   │   ├── geminiAdapter.ts # 🔄 Gemini CLI wrapper
│   │   ├── resultMapper.ts  # 🔄 Findings → ADO comment mapping
│   │   ├── commenter.ts     # 🔄 Yorum gönderici
│   │   ├── statusReporter.ts # 🔄 PR status yönetimi
│   │   └── workspace.ts     # 🔄 Temp workspace yönetimi
│   └── config/              # Configuration files
│       ├── defaults.yaml    # ✅ Varsayılan konfigürasyon
│       └── schema.json      # ✅ JSON schema validasyonu
├── tests/                   # 🔄 Test dosyaları
├── docs/                    # 🔄 Dokümantasyon
├── examples/                # 🔄 Örnek konfigürasyonlar
├── package.json             # ✅ Proje bağımlılıkları ve scriptler
├── tsconfig.json            # ✅ TypeScript konfigürasyonu
└── README.md                # ✅ Proje dokümantasyonu
```

**Durum Göstergeleri:**
- ✅ Tamamlandı
- 🔄 Geliştirilecek
- ❌ Henüz başlanmadı

### 5.2 Teknoloji Stack'i

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.x
- **CLI Framework**: Commander.js
- **HTTP Client**: Axios
- **Logging**: Winston + Chalk
- **Config**: js-yaml
- **Testing**: Jest + @types/jest
- **Linting**: ESLint + Prettier
- **Build**: TypeScript Compiler

---

## 6. LLM Context Oluşturma Mantığı

**Girdi Katmanları:**
1. **Kurallar (Rules)** — YAML/JSON formatındaki teknik kurallar  
2. **Proje Kuralları** — Tekil proje standartları dosyası  
3. **Proje Rehberleri** — `.md` formatında proje yapısı, standartlar  
4. **Diff** — PR Iteration Changes ile gelen değişiklik hunk’ları

**Birleştirme Stratejisi:**
- MD dosyaları plain text’e dönüştürülür.
- Rules & proje kuralları YAML → JSON’a çevrilir.
- Prompt şablonu:
```
[PROJECT RULES & STRUCTURE]
<md içerikleri>

[REVIEW RULES]
<yaml kuralları>

[DIFFS TO REVIEW]
<diff içerikleri>
```
- LLM’e tek prompt olarak gönderilir veya batch’lere bölünür.

### 6.1 Context Builder Pseudo-code

```ts
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { stripMarkdown } from "./utils/stripMarkdown"; // md → plain text

interface ReviewContext {
  projectRules: string;
  reviewRules: string;
  diffs: string;
}

export class ContextBuilder {
  constructor(
    private rulesPaths: string[],
    private projectRulesPath?: string,
    private diffs: string
  ) {}

  public build(): ReviewContext {
    const mdContents: string[] = [];
    const yamlRules: any[] = [];

    for (const rulesPath of this.rulesPaths) {
      const ext = path.extname(rulesPath).toLowerCase();
      const content = fs.readFileSync(rulesPath, "utf-8");

      if (ext === ".md") {
        mdContents.push(stripMarkdown(content));
      } else if (ext === ".yaml" || ext === ".yml" || ext === ".json") {
        const parsed = ext === ".json" ? JSON.parse(content) : yaml.load(content);
        yamlRules.push(parsed);
      }
    }

    if (this.projectRulesPath) {
      const ext = path.extname(this.projectRulesPath).toLowerCase();
      const content = fs.readFileSync(this.projectRulesPath, "utf-8");
      if (ext === ".md") {
        mdContents.push(stripMarkdown(content));
      } else if (ext === ".yaml" || ext === ".yml" || ext === ".json") {
        const parsed = ext === ".json" ? JSON.parse(content) : yaml.load(content);
        yamlRules.push(parsed);
      }
    }

    const mergedRules = yamlRules.reduce((acc, curr) => {
      if (curr.rules) {
        acc.rules = [...(acc.rules || []), ...curr.rules];
      }
      return acc;
    }, {} as any);

    const projectRulesText = mdContents.join("\n\n");
    const reviewRulesText = JSON.stringify(mergedRules, null, 2);

    return {
      projectRules: projectRulesText,
      reviewRules: reviewRulesText,
      diffs: this.diffs
    };
  }

  public toPrompt(context: ReviewContext): string {
    return `
[PROJECT STRUCTURE & GUIDELINES]
${context.projectRules}

[REVIEW RULES]
${context.reviewRules}

[DIFFS TO REVIEW]
${context.diffs}
`;
  }
}
```

---

## 7. CLI Parametreleri (Özet)

- `--pr-url <url>` | `--pr <id>` + `--org --project --repo`
- `--rules <glob|path>` (çoklu)
- `--project-rules <path>`
- `--include <glob>` / `--exclude <glob>` / `--files <list>` / `--all-files`
- `--model <gemini-model>`
- `--max-context-tokens <n>`
- `--ratelimit-batch <n>` / `--ratelimit-sleep-ms <ms>`
- `--tmp-dir <path>` / `--keep-workdir`
- `--post-status`
- `--auto-approve`
- `--dry-run`
- `--format <table|json>`
- `--severity-threshold <info|warn|error>`

---

## 8. Hata Yönetimi

- Kullanıcı hataları → exit code `3`
- API hataları (ADO/Gemini) → retry/backoff, kod `4`
- İç hata → kod `5`
- Çıkış kodu `2` = bulgular var, eşik üstü

---

## 9. Kabul Kriterleri

### 9.1 Fonksiyonel Gereksinimler ✅

- ✅ CLI entry point ve argüman parsing
- ✅ Kapsamlı loglama sistemi
- ✅ Hata yönetimi ve exit kodları
- ✅ Konfigürasyon sistemi
- 🔄 `.yaml/.json` rules + `.md` rehberler aynı bağlamda işlenmeli
- 🔄 Yalnız diff edilmiş satırlar LLM'e gönderilmeli
- 🔄 PR Iteration Changes kullanılmalı
- 🔄 Paket klasörleri ve lock dosyaları hariç tutulmalı
- 🔄 Idempotent yorum sistemi olmalı
- 🔄 Rate limit'ler aşıldığında batchleme ve uyku uygulanmalı

### 9.2 Teknik Gereksinimler ✅

- ✅ TypeScript strict mode
- ✅ ESM module format
- ✅ Commander.js CLI framework
- ✅ Winston logging
- ✅ Comprehensive error handling
- ✅ JSON schema validation
- 🔄 Unit test coverage >90%
- 🔄 Integration tests
- 🔄 E2E tests

### 9.3 Güvenlik Gereksinimleri

- ✅ Secret masking in logs
- 🔄 Input validation
- 🔄 Secure token handling
- 🔄 Temp file cleanup
- 🔄 Rate limiting

### 9.4 Performans Gereksinimleri

- 🔄 Memory efficient processing
- 🔄 Streaming for large files
- 🔄 Batch processing optimization
- 🔄 API rate limit compliance
- 🔄 Graceful degradation

---

## 10. Geliştirme Durumu

### 10.1 Tamamlanan Modüller

1. **CLI Infrastructure** ✅
   - `cli/index.ts`: Commander.js ile CLI entry point
   - `cli/argsParser.ts`: Argüman parsing ve validasyon
   - Tüm CLI parametreleri tanımlandı

2. **Core Infrastructure** ✅
   - `core/logger.ts`: Winston tabanlı loglama sistemi
   - `core/errorHandler.ts`: Kapsamlı hata yönetimi
   - `core/reviewOrchestrator.ts`: Ana orkestrasyon sınıfı

3. **Configuration** ✅
   - `config/defaults.yaml`: Varsayılan ayarlar
   - `config/schema.json`: JSON schema validasyonu
   - TypeScript konfigürasyonu

4. **Documentation** ✅
   - Kapsamlı README.md
   - Proje yapısı dokümantasyonu
   - Kullanım örnekleri

### 10.2 Geliştirilecek Modüller

1. **Azure DevOps Integration** 🔄
   - `core/adoClient.ts`: API wrapper
   - `core/diffFetcher.ts`: PR diff alma
   - `core/commenter.ts`: Yorum gönderme
   - `core/statusReporter.ts`: PR status güncelleme

2. **Git Operations** 🔄
   - `core/gitManager.ts`: Clone ve checkout işlemleri
   - `core/workspace.ts`: Temp workspace yönetimi

3. **AI Integration** 🔄
   - `core/geminiAdapter.ts`: Gemini API entegrasyonu
   - `core/contextBuilder.ts`: LLM context oluşturma
   - `core/reviewPlanner.ts`: Batch planlama
   - `core/resultMapper.ts`: Sonuç mapping

4. **Rules Engine** 🔄
   - `core/rulesLoader.ts`: Kural dosyası yükleme
   - YAML/JSON/MD dosya işleme

5. **Testing & Quality** 🔄
   - Unit testler
   - Integration testler
   - E2E testler
   - Code coverage

### 10.3 Gelecek Genişletmeler

- **Suggested Changes**: ADO "suggested commit" formatında öneriler
- **CI/CD Integration**: Pipeline entegrasyon preset'leri
- **SARIF Reports**: Güvenlik analiz raporu üretimi
- **Multi-Platform**: GitHub, GitLab desteği
- **Plugin System**: Özel kural eklentileri
- **Web Dashboard**: Web tabanlı yönetim paneli

---

## 11. Geliştirme Kuralları

### 11.1 Kod Standartları

- **TypeScript Strict Mode**: Tüm strict ayarları aktif
- **ESLint Rules**: Airbnb config + custom rules
- **Prettier**: Otomatik kod formatlama
- **Conventional Commits**: Commit mesaj formatı
- **JSDoc**: Public API'ler için dokümantasyon

### 11.2 Test Stratejisi

- **Unit Tests**: Her modül için %90+ coverage
- **Integration Tests**: API entegrasyonları
- **E2E Tests**: Tam workflow testleri
- **Mock Strategy**: External API'ler için mock'lar

### 11.3 Error Handling

- **Custom Error Types**: Kategorize edilmiş hatalar
- **Exit Codes**: Anlamlı çıkış kodları
- **Logging**: Structured logging with context
- **Recovery**: Graceful degradation

### 11.4 Performance

- **Rate Limiting**: API limit yönetimi
- **Batch Processing**: Büyük PR'lar için optimizasyon
- **Memory Management**: Büyük dosyalar için streaming
- **Caching**: Tekrarlanan işlemler için cache

---

## 12. Workspace Structure

### Repository Cloning Strategy

The CLI uses a structured workspace approach to separate project files from cloned repositories:

- **Workspace Root**: Created in OS temp directory (e.g., `/tmp/ado-review-{timestamp}-{random}`)
- **Subdirectories**:
  - `source/`: Contains cloned repository files
  - `temp/`: Temporary processing files
  - `output/`: Generated output files
  - `logs/`: Log files

### Implementation Details

1. **Workspace Creation**: The `Workspace` class creates standard subdirectories when `createSubdirs` option is enabled
2. **Repository Cloning**: Repositories are cloned into the `source/` subdirectory, not the workspace root
3. **Directory Separation**: This prevents mixing of:
   - Project files (CLI source code, node_modules, etc.)
   - Local working directories (logs, output, temp)
   - Cloned repository content

### Code Changes Made

- **ReviewOrchestrator**: Modified `fetchDiffs()` method to use `workspace.getSubdirPath('source')` for repository cloning
- **DiffFetcher**: Updated to receive and use the correct working directory path for git operations

### Benefits

- Clean separation of concerns
- Prevents file conflicts between CLI and repository files
- Easier cleanup and debugging
- Better organization of temporary files

## 13. Development Guidelines

### Workspace Usage

When working with workspace operations:

1. Always use `workspace.getSubdirPath()` for accessing subdirectories
2. Pass the correct working directory to git operations
3. Ensure cleanup handlers are properly configured

### File Organization

- Keep CLI source files separate from workspace operations
- Use appropriate subdirectories for different types of temporary files
- Implement proper cleanup to avoid leaving temporary files

## 14. Configuration

### Environment Variables

- `ADO_REVIEW_LOG_LEVEL`: Controls logging level (error, warn, info, debug)
- Other environment variables as documented in README.md

### Logging

The logging system supports:
- Console output with appropriate levels
- File-based logging for debugging
- Structured logging with context information

## 15. CI/CD Pipeline ve Otomatik Release

### GitHub Actions Workflow

Proje, otomatik versiyonlama ve release sürecini yönetmek için GitHub Actions kullanır. Workflow dosyası `.github/workflows/release.yml` konumunda bulunur.

### Workflow Tetikleme Koşulları

1. **Master/Main Branch Push**: Doğrudan master branch'ine push işlemi
2. **Pull Request Merge**: Master/main branch'ine merge edilen PR'lar

### Otomatik Release Süreci

#### 1. Tetikleme ve Hazırlık
- Workflow, master branch'ine yapılan değişikliklerde otomatik tetiklenir
- Ubuntu latest runner üzerinde çalışır
- Node.js 18 ve npm cache kurulumu yapılır

#### 2. Test ve Build
- `npm ci` ile bağımlılıklar yüklenir
- `npm test` ile testler çalıştırılır (başarısız olursa workflow durur)
- `npm run build` ile proje build edilir

#### 3. Semantik Versiyonlama
- Mevcut versiyon `package.json`'dan okunur
- `npm version patch` ile patch seviyesinde versiyon artışı yapılır
- SemVer kurallarına uygun olarak `1.0.0` → `1.0.1` → `1.0.2` formatında

#### 4. Git İşlemleri
- Versiyon değişikliği commit edilir: `chore: bump version to v{version}`
- Git tag oluşturulur: `v{version}` formatında
- Değişiklikler ve tag'ler remote repository'ye push edilir

#### 5. Release Asset'leri Oluşturma
- **NPM Package**: `npm pack` ile `.tgz` dosyası oluşturulur
- **Distribution Bundle**: Build edilmiş dosyalar, package.json ve README.md ile `.zip` dosyası oluşturulur
- Asset'ler `release-assets/` klasörüne yerleştirilir

#### 6. Changelog Üretimi
- Son tag'den bu yana yapılan commit'ler otomatik olarak toplanır
- Merge commit'ler hariç tutulur
- Commit formatı: `- {commit message} ({short hash})`
- GitHub karşılaştırma linki eklenir

#### 7. GitHub Release
- `softprops/action-gh-release@v1` action'ı kullanılır
- Release başlığı: `Release v{version}`
- Otomatik üretilen changelog release açıklamasına eklenir
- NPM paketi ve distribution bundle asset olarak yüklenir

### Workflow Özellikleri

#### Güvenlik
- `contents: write` ve `pull-requests: write` izinleri
- `GITHUB_TOKEN` kullanarak güvenli API erişimi

#### Hata Yönetimi
- Test başarısızlığında workflow durur
- Her adım için uygun hata kontrolü
- Başarılı tamamlanma bildirimi

#### Performance
- NPM cache kullanımı
- Sadece gerekli dosyaların işlenmesi
- Efficient asset oluşturma

### Manuel Versiyon Yönetimi

Otomatik patch artışı dışında manuel versiyon değişiklikleri:

```bash
# Minor versiyon artışı (1.0.0 → 1.1.0)
npm version minor
git push origin master --tags

# Major versiyon artışı (1.0.0 → 2.0.0)
npm version major
git push origin master --tags
```

### Workflow Dosya Yapısı

```yaml
# .github/workflows/release.yml
name: Auto Release

on:
  push:
    branches: [master, main]
  pull_request:
    types: [closed]
    branches: [master, main]

jobs:
  release:
    if: github.event_name == 'push' || (github.event.pull_request.merged == true)
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
```

### Çıktılar ve Asset'ler

Her başarılı release'de oluşturulan dosyalar:

1. **ado-review-cli-v{version}.tgz**: NPM paketi
2. **ado-review-cli-v{version}.zip**: Distribution bundle
3. **Git Tag**: `v{version}` formatında
4. **GitHub Release**: Changelog ile birlikte
5. **Commit**: Versiyon artışı için otomatik commit

### Geliştirme Kuralları

#### Commit Mesajları
- Conventional Commits formatı önerilir
- Changelog'da anlamlı görünüm için açıklayıcı mesajlar
- Merge commit'ler changelog'dan otomatik hariç tutulur

#### Branch Stratejisi
- Master/main branch production-ready kod içerir
- Feature branch'ler PR ile merge edilir
- Merge sonrası otomatik release tetiklenir

#### Test Gereksinimleri
- Tüm testler geçmeli (workflow requirement)
- Build başarılı olmalı
- Lint kurallarına uygunluk önerilir

## 16. Proje Kuralları ve Değişiklik Geçmişi

### Proje Yapısı ve Mimari

#### Core Modüller

- **CLI Layer** (`src/cli/`): Commander.js tabanlı CLI interface
- **Core Layer** (`src/core/`): Ana business logic ve orchestration
- **Config Layer** (`src/config/`): Konfigürasyon yönetimi ve validation

#### Temel Prensipler

1. **Separation of Concerns**: Her modül tek bir sorumluluğa sahip
2. **Dependency Injection**: Constructor-based dependency injection
3. **Error Handling**: Merkezi hata yönetimi ve anlamlı exit kodları
4. **Logging**: Structured logging with Winston
5. **Type Safety**: Strict TypeScript configuration

### Son Değişiklikler

#### 2024-01-XX - PR Onaylama Özelliği Eklendi

##### Yapısal Değişiklikler

**ADOClient Sınıfı (`src/core/adoClient.ts`)**
- `approvePullRequest(pullRequestId: number, reviewerId: string)` metodu eklendi
- `getCurrentUserId()` metodu eklendi
- Azure DevOps REST API'nin `PUT /pullrequests/{id}/reviewers/{reviewerId}` endpoint'i kullanılıyor
- Vote değeri 10 (approved) olarak ayarlanıyor

**ReviewOrchestrator Sınıfı (`src/core/reviewOrchestrator.ts`)**
- `approvePullRequest()` metodu eklendi
- `promptUserApproval()` metoduna `[p] Approve PR` seçeneği eklendi
- Kullanıcı 'p' seçtiğinde PR otomatik olarak onaylanıyor ve hiçbir yorum gönderilmiyor

##### Kullanıcı Deneyimi Değişiklikleri

**İnteraktif Onay Sistemi**
- Yeni seçenek: `[p] Approve PR (no findings will be posted)`
- Bu seçenek seçildiğinde:
  - Mevcut kullanıcının ID'si otomatik olarak alınır
  - PR, Azure DevOps API üzerinden onaylanır
  - Hiçbir code review yorumu gönderilmez
  - İşlem başarılı olduğunda kullanıcıya bilgi verilir

##### API Entegrasyonu

**Azure DevOps REST API**
- Endpoint: `PUT https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/reviewers/{reviewerId}`
- API Version: 7.1
- Vote Values:
  - 10: Approved
  - 5: Approved with suggestions
  - 0: No vote
  - -5: Waiting for author
  - -10: Rejected

##### Hata Yönetimi

- API çağrıları sırasında oluşabilecek hatalar merkezi error handler ile yönetiliyor
- Kullanıcı ID'si alınamadığında anlamlı hata mesajları
- PR onaylama işlemi başarısız olduğunda detaylı hata raporlama

##### Güvenlik Considerations

- Kullanıcının PR'ı onaylama yetkisi Azure DevOps tarafında kontrol ediliyor
- API token'ı ile kimlik doğrulama yapılıyor
- Sadece mevcut kullanıcının kendisi reviewer olarak ekleniyor

#### Gelecek Geliştirmeler

- [ ] Farklı vote seviyeleri için seçenekler (approve with suggestions, reject)
- [ ] Bulk PR onaylama özelliği
- [ ] PR onaylama geçmişi ve raporlama
- [ ] Team reviewer assignment özelliği

### Kod Standartları

#### TypeScript
- Strict mode aktif
- Explicit return types for public methods
- Interface segregation principle
- Proper error typing

#### Error Handling
- Custom error types for different scenarios
- Structured error context with metadata
- Graceful degradation strategies
- Meaningful exit codes

#### Logging
- Structured logging with context
- Secret masking for sensitive data
- Different log levels for different environments
- File and console output support

#### Testing
- Unit tests for all core functionality
- Integration tests for API interactions
- Mock strategies for external dependencies
- Coverage requirements >90%

### Deployment ve CI/CD

#### Build Process
- TypeScript compilation
- Config file copying
- Dependency bundling
- Version management

#### Release Strategy
- Semantic versioning
- Automated releases via GitHub Actions
- NPM package publishing
- Documentation updates

### Bağımlılık Yönetimi

#### Core Dependencies
- `commander`: CLI framework
- `axios`: HTTP client
- `winston`: Logging
- `js-yaml`: YAML parsing
- `chalk`: Terminal colors

#### Development Dependencies
- `typescript`: Language support
- `jest`: Testing framework
- `eslint`: Code linting
- `prettier`: Code formatting

### Konfigürasyon Yönetimi

#### Dosya Hiyerarşisi
1. CLI arguments (en yüksek öncelik)
2. `.adorevrc.yaml` (proje dizini)
3. `~/.adorevrc.yaml` (kullanıcı dizini)
4. Default configuration (en düşük öncelik)

#### Validation
- JSON Schema validation
- Runtime type checking
- Environment variable validation
- File path validation
