<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$segmentId = $_GET['id'] ?? '';

if (empty($segmentId) || !ctype_digit($segmentId)) {
    http_response_code(400);
    echo json_encode(["error" => "無効な Segment ID です"]);
    exit;
}

// --- DB接続設定 ---
$dbHost = 'localhost';
$dbName = 'hifive_animalland';
$dbUser = 'hifive_system';
$dbPass = 'Katan20010303!';

try {
    $pdo = new PDO("mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "DB接続エラーが発生しました"]);
    exit;
}

// --- STEP 1: DB内にコースキャッシュが存在するか確認 ---
$stmt = $pdo->prepare("SELECT name, distance_km AS distanceKm, elevation_gain_m AS elevationGainM FROM segments WHERE segment_id = :id");
$stmt->execute([':id' => $segmentId]);
$cachedData = $stmt->fetch();

if ($cachedData) {
    echo json_encode([
        'name' => $cachedData['name'],
        'distanceKm' => (float)$cachedData['distanceKm'],
        'elevationGainM' => (int)$cachedData['elevationGainM']
    ]);
    exit;
}

// --- STEP 2: アクセストークン自動更新関数 ---
function getValidAccessToken($pdo) {
    // Strava Developer Portal (https://www.strava.com/settings/api) の情報を設定
    $clientId = '22925';
    $clientSecret = '0273c7c8f71ed7672edeb20907662565fcbed9cc';
    $initialRefreshToken = 'd35983f6a6c91ee80b9f75921207b883c37047a6';

    // DBから既存のトークン情報を取得
    $stmt = $pdo->query("SELECT refresh_token, access_token, expires_at FROM strava_auth WHERE id = 1");
    $auth = $stmt->fetch();

    $currentTime = time();

    // 有効期限が5分以上残っているアクセストークンがあればそのまま使用
    if ($auth && !empty($auth['access_token']) && $auth['expires_at'] > ($currentTime + 300)) {
        return $auth['access_token'];
    }

    // 期限切れまたは初回の場合、リフレッシュトークンを使って再発行
    $refreshToken = ($auth && !empty($auth['refresh_token'])) ? $auth['refresh_token'] : $initialRefreshToken;

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

    // 更新された最新トークンをDBへ保存 (UPSERT)
    $saveStmt = $pdo->prepare("
        INSERT INTO strava_auth (id, refresh_token, access_token, expires_at)
        VALUES (1, :refresh_token, :access_token, :expires_at)
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

// --- STEP 3: 有効なアクセストークンを取得 ---
$accessToken = getValidAccessToken($pdo);

if (!$accessToken) {
    http_response_code(500);
    echo json_encode(["error" => "アクセストークンの更新に失敗しました"]);
    exit;
}

// --- STEP 4: Strava API からコース情報を取得 ---
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "https://www.strava.com/api/v3/segments/" . $segmentId);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer " . $accessToken
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200) {
    http_response_code($httpCode);
    echo json_encode(["error" => "Strava APIからのデータ取得に失敗しました"]);
    exit;
}

$data = json_decode($response, true);
$name = $data['name'] ?? '';
$distanceKm = round(($data['distance'] ?? 0) / 1000, 2);
$elevationGainM = round($data['total_elevation_gain'] ?? 0);

// --- STEP 5: 取得したコースデータを DB にキャッシュ保存 ---
try {
    $insertStmt = $pdo->prepare("INSERT INTO segments (segment_id, name, distance_km, elevation_gain_m) VALUES (:id, :name, :dist, :elev)");
    $insertStmt->execute([
        ':id' => $segmentId,
        ':name' => $name,
        ':dist' => $distanceKm,
        ':elev' => $elevationGainM,
    ]);
} catch (PDOException $e) {
    // キャッシュ失敗時もデータ返却はそのまま行う
}

// --- STEP 6: Angular へ返却 ---
echo json_encode([
    'name' => $name,
    'distanceKm' => $distanceKm,
    'elevationGainM' => $elevationGainM
]);