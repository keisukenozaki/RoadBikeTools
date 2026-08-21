<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

// 設定ファイルの読み込み
$configFile = __DIR__ . '/config.php';

if (!file_exists($configFile)) {
    http_response_code(500);
    echo json_encode([
        "error" => "設定ファイル(config.php)が存在しません"
    ]);
    exit;
}

$config = require $configFile;

// Angularから受け取る値
$segmentId = $_GET['id'] ?? '';
$courseName = $_GET['name'] ?? '';

// Segment ID のチェック
if (empty($segmentId) || !ctype_digit($segmentId)) {
    http_response_code(400);
    echo json_encode([
        "error" => "無効な Segment ID です"
    ]);
    exit;
}

// コース名のチェック
if (empty($courseName)) {
    http_response_code(400);
    echo json_encode([
        "error" => "コース名が指定されていません"
    ]);
    exit;
}


// --------------------------------------------------
// DB接続
// --------------------------------------------------
try {
    $pdo = new PDO(
        "mysql:host={$config['db']['host']};dbname={$config['db']['name']};charset=utf8mb4",
        $config['db']['user'],
        $config['db']['pass'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "error" => "DB接続エラーが発生しました"
    ]);
    exit;
}


// --------------------------------------------------
// STEP 1: DB内にコースキャッシュが存在するか確認
// --------------------------------------------------
$stmt = $pdo->prepare("
    SELECT
        name,
        strava_name,
        average_grade AS averageGrade,
        maximum_grade AS maximumGrade,
        distance_km AS distanceKm,
        elevation_gain_m AS elevationGainM
    FROM segments
    WHERE segment_id = :id
");

$stmt->execute([
    ':id' => $segmentId
]);

$cachedData = $stmt->fetch();

if ($cachedData) {

    // DBにキャッシュがある場合は
    // Angularから渡されたコース名を画面表示用として使用
    echo json_encode([
        'name' => $courseName,
        'stravaName' => $cachedData['strava_name'],
        'averageGrade' => $cachedData['averageGrade'],
        'maximumGrade' => $cachedData['maximumGrade'],
        'distanceKm' => (float)$cachedData['distanceKm'],
        'elevationGainM' => (int)$cachedData['elevationGainM']
    ]);

    exit;
}


// --------------------------------------------------
// STEP 2: アクセストークン自動更新関数
// --------------------------------------------------
function getValidAccessToken($pdo, $config)
{
    $clientId = $config['strava']['client_id'];
    $clientSecret = $config['strava']['client_secret'];
    $initialRefreshToken = $config['strava']['refresh_token'];

    // DBから既存のトークン情報を取得
    $stmt = $pdo->query("
        SELECT refresh_token, access_token, expires_at
        FROM strava_auth
        WHERE id = 1
    ");

    $auth = $stmt->fetch();

    $currentTime = time();

    // 有効期限が5分以上残っている場合はそのまま使用
    if (
        $auth &&
        !empty($auth['access_token']) &&
        $auth['expires_at'] > ($currentTime + 300)
    ) {
        return $auth['access_token'];
    }

    // 期限切れまたは初回の場合
    $refreshToken =
        ($auth && !empty($auth['refresh_token']))
            ? $auth['refresh_token']
            : $initialRefreshToken;

    $ch = curl_init('https://www.strava.com/oauth/token');

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'grant_type' => 'refresh_token',
            'refresh_token' => $refreshToken,
        ]),
        CURLOPT_SSL_VERIFYPEER => false,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);

    if ($httpCode !== 200) {
        return null;
    }

    $data = json_decode($response, true);

    $newAccessToken = $data['access_token'] ?? null;
    $newRefreshToken = $data['refresh_token'] ?? $refreshToken;
    $newExpiresAt = $data['expires_at'] ?? 0;

    if (!$newAccessToken) {
        return null;
    }

    // 最新トークンをDBへ保存
    $saveStmt = $pdo->prepare("
        INSERT INTO strava_auth (
            id,
            refresh_token,
            access_token,
            expires_at
        )
        VALUES (
            1,
            :refresh_token,
            :access_token,
            :expires_at
        )
        ON DUPLICATE KEY UPDATE
            refresh_token = VALUES(refresh_token),
            access_token = VALUES(access_token),
            expires_at = VALUES(expires_at)
    ");

    $saveStmt->execute([
        ':refresh_token' => $newRefreshToken,
        ':access_token' => $newAccessToken,
        ':expires_at' => $newExpiresAt,
    ]);

    return $newAccessToken;
}


// --------------------------------------------------
// STEP 3: 有効なアクセストークンを取得
// --------------------------------------------------
$accessToken = getValidAccessToken($pdo, $config);

if (!$accessToken) {
    http_response_code(500);

    echo json_encode([
        "error" => "アクセストークンの更新に失敗しました"
    ]);

    exit;
}


// --------------------------------------------------
// STEP 4: Strava API からコース情報を取得
// --------------------------------------------------
$ch = curl_init();

curl_setopt($ch, CURLOPT_URL,
    "https://www.strava.com/api/v3/segments/" . $segmentId
);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer " . $accessToken
]);

$response = curl_exec($ch);

$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

curl_close($ch);

// Strava APIのレスポンスをログに出力
error_log("=== Strava API Response ===");
error_log("HTTP Code: " . $httpCode);
error_log($response);
error_log("=== End Strava API Response ===");

if ($httpCode !== 200) {
    http_response_code($httpCode);

    echo json_encode([
        "error" => "Strava APIからのデータ取得に失敗しました"
    ]);

    exit;
}

$data = json_decode($response, true);

// Stravaから取得した名前
$stravaName = $data['name'] ?? '';
// 勾配
$averageGrade = $data['average_grade'] ?? null;
$maximumGrade = $data['maximum_grade'] ?? null;
// 距離
$distanceKm = round(
    ($data['distance'] ?? 0) / 1000,
    2
);
// 標高差
$elevationGainM = round(
    $data['total_elevation_gain'] ?? 0
);

// --------------------------------------------------
// STEP 5: 取得したコースデータをDBにキャッシュ保存
// --------------------------------------------------
try {

    $insertStmt = $pdo->prepare("
        INSERT INTO segments (
            segment_id,
            name,
            strava_name,
            average_grade,
            maximum_grade,
            distance_km,
            elevation_gain_m
        )
        VALUES (
            :id,
            :name,
            :strava_name,
            :average_grade,
            :maximum_grade,
            :dist,
            :elev
        )
    ");

    $insertStmt->execute([
        ':id' => $segmentId,
        ':name' => $courseName,
        ':strava_name' => $stravaName,
        ':average_grade' => $averageGrade,
        ':maximum_grade' => $maximumGrade,
        ':dist' => $distanceKm,
        ':elev' => $elevationGainM,
    ]);

} catch (PDOException $e) {

    // キャッシュ保存に失敗しても
    // APIの結果自体は返す
}


// --------------------------------------------------
// STEP 6: Angularへ返却
// --------------------------------------------------
echo json_encode([
    'name' => $courseName,
    'stravaName' => $stravaName,
    'averageGrade' => $averageGrade,
    'maximumGrade' => $maximumGrade,
    'distanceKm' => $distanceKm,
    'elevationGainM' => $elevationGainM
]);