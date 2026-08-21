<?php

/**
 * Strava API 共通認証モジュール
 *
 * getValidAccessToken($pdo, $config)
 * を呼び出すことで、有効なアクセストークンを取得できます。
 */

function getValidAccessToken(PDO $pdo, array $config): ?string
{
    $clientId = $config['strava']['client_id'];
    $clientSecret = $config['strava']['client_secret'];
    $initialRefreshToken = $config['strava']['refresh_token'];

    // ------------------------------------------
    // DBから現在の認証情報を取得
    // ------------------------------------------

    $stmt = $pdo->query("
        SELECT refresh_token, access_token, expires_at
        FROM strava_auth
        WHERE id = 1
    ");

    $auth = $stmt->fetch();

    $currentTime = time();

    // ------------------------------------------
    // アクセストークンがまだ有効ならそのまま使用
    // ------------------------------------------

    if (
        $auth &&
        !empty($auth['access_token']) &&
        $auth['expires_at'] > ($currentTime + 300)
    ) {
        return $auth['access_token'];
    }

    // ------------------------------------------
    // リフレッシュトークンを決定
    // ------------------------------------------

    $refreshToken =
        ($auth && !empty($auth['refresh_token']))
            ? $auth['refresh_token']
            : $initialRefreshToken;

    // ------------------------------------------
    // Strava OAuth Token API
    // ------------------------------------------

    $ch = curl_init(
        'https://www.strava.com/oauth/token'
    );

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

    $httpCode = curl_getinfo(
        $ch,
        CURLINFO_HTTP_CODE
    );

    curl_close($ch);

    // ------------------------------------------
    // APIエラー
    // ------------------------------------------

    if ($httpCode !== 200) {
        return null;
    }

    $data = json_decode(
        $response,
        true
    );

    $newAccessToken =
        $data['access_token'] ?? null;

    $newRefreshToken =
        $data['refresh_token'] ?? $refreshToken;

    $newExpiresAt =
        $data['expires_at'] ?? 0;

    if (!$newAccessToken) {
        return null;
    }

    // ------------------------------------------
    // 最新のトークンをDBへ保存
    // ------------------------------------------

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