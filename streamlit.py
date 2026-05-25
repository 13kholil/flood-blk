import os
import requests
import pandas as pd
import streamlit as st
from datetime import datetime
import folium
from streamlit_folium import st_folium
import plotly.express as px
import plotly.graph_objects as go

st.set_page_config(page_title="Siaga Bulukumba", page_icon="🌊", layout="wide")

API_BASE = os.environ.get("API_URL", "http://localhost:4000")
MAP_CENTER = [-5.5544, 120.1980]

def api_get(path):
    try:
        r = requests.get(f"{API_BASE}{path}", timeout=10)
        return r.json() if r.ok else None
    except:
        return None

def depth_color(d):
    if not d or d == 0:
        return "#cccccc"
    if d <= 20:
        return "#ccf2ff"
    if d <= 50:
        return "#66ccff"
    if d <= 100:
        return "#0066cc"
    return "#003366"

def depth_label(d):
    if not d or d == 0:
        return "Tidak ada data"
    if d <= 20:
        return "Rendah"
    if d <= 50:
        return "Sedang"
    if d <= 100:
        return "Tinggi"
    return "Bahaya"

# ---------- Sidebar ----------
st.sidebar.markdown("# 🌊 Siaga Bulukumba")
st.sidebar.markdown("Sistem Informasi Banjir Kota Bulukumba")
st.sidebar.divider()

page = st.sidebar.radio("Menu", ["Dashboard", "Peta", "Laporan", "Cuaca"])

# ---------- Dashboard ----------
if page == "Dashboard":
    st.title("📊 Dashboard Banjir Bulukumba")

    stats = api_get("/api/reports/stats")
    if not stats:
        st.error(f"Tidak dapat terhubung ke backend di {API_BASE}")
        st.stop()

    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("Total Laporan", stats.get("total", 0))
    col2.metric("Terverifikasi", stats.get("verified", 0))
    col3.metric("Rata-rata Kedalaman", f"{stats.get('avgDepth', 0)} cm")
    col4.metric("Maksimum", f"{stats.get('maxDepth', 0)} cm")
    col5.metric("Hari Ini", stats.get("today", 0))

    st.divider()

    reports = api_get("/api/reports?limit=500")
    if reports:
        rows = reports if isinstance(reports, list) else reports.get("rows", [])
        if rows:
            df = pd.DataFrame(rows)
            df["created_at"] = pd.to_datetime(df["created_at"])
            df["depth_group"] = df["water_depth"].apply(depth_label)
            df["date"] = df["created_at"].dt.date

            col1, col2 = st.columns(2)
            with col1:
                depth_order = ["Rendah", "Sedang", "Tinggi", "Bahaya", "Tidak ada data"]
                depth_counts = df["depth_group"].value_counts()
                fig = px.pie(
                    values=depth_counts.values,
                    names=depth_counts.index,
                    title="Distribusi Kedalaman Banjir",
                    color_discrete_map={
                        "Rendah": "#ccf2ff", "Sedang": "#66ccff",
                        "Tinggi": "#0066cc", "Bahaya": "#003366",
                        "Tidak ada data": "#cccccc",
                    },
                )
                st.plotly_chart(fig, use_container_width=True)

            with col2:
                daily = df.groupby("date").size().reset_index(name="jumlah")
                fig2 = px.bar(daily, x="date", y="jumlah", title="Laporan per Hari")
                st.plotly_chart(fig2, use_container_width=True)

            st.divider()
            st.subheader("📍 Lokasi dengan Laporan Terbanyak")
            top_locs = stats.get("byLocation", [])
            if top_locs:
                loc_df = pd.DataFrame(top_locs)
                fig3 = px.bar(
                    loc_df.head(10), x="count", y="location_name",
                    orientation="h", color="avg_depth",
                    color_continuous_scale="Blues",
                    labels={"count": "Jumlah", "location_name": "Lokasi", "avg_depth": "Rata-rata Kedalaman (cm)"},
                )
                st.plotly_chart(fig3, use_container_width=True)

# ---------- Peta ----------
elif page == "Peta":
    st.title("🗺️ Peta Genangan Banjir")
    reports = api_get("/api/reports?limit=500")
    rows = reports if isinstance(reports, list) else reports.get("rows", []) if reports else []

    kelurahan_geojson = None
    import json as _json
    local_path = os.path.join(os.path.dirname(__file__), "frontend", "public", "data", "kelurahan-ujungbulu.geojson")
    if os.path.exists(local_path):
        with open(local_path) as f:
            kelurahan_geojson = _json.load(f)
    else:
        try:
            r = requests.get(f"{API_BASE}/data/kelurahan-ujungbulu.geojson", timeout=10)
            if r.ok:
                kelurahan_geojson = r.json()
        except:
            pass

    with st.expander("ℹ️ Tentang Peta Ini", expanded=False):
        st.markdown("""
        - **Marker biru** — laporan terverifikasi
        - **Marker abu-abu** — laporan menunggu verifikasi
        - **Warna polygon** — rata-rata kedalaman per kelurahan
        - Klik marker untuk detail laporan
        """)

    m = folium.Map(location=MAP_CENTER, zoom_start=14, control_scale=True)

    # Kelurahan boundaries
    if kelurahan_geojson:
        for feature in kelurahan_geojson.get("features", []):
            name = feature["properties"].get("wadmkd") or feature["properties"].get("namobj", "")
            coords = feature["geometry"]["coordinates"]

            # Compute average depth for this kelurahan
            depths = []
            for r in rows:
                if r.get("water_depth", 0) > 0:
                    depths.append(r["water_depth"])
            avg_d = sum(depths) / len(depths) if depths else 0

            style = {
                "fillColor": depth_color(avg_d),
                "color": "#2c3e50",
                "weight": 1.5,
                "fillOpacity": 0.4,
            }

            gj = folium.GeoJson(
                feature,
                style_function=lambda x, s=style: s,
                popup=folium.Popup(
                    f"<b>{name}</b><br>Rata-rata kedalaman: {avg_d:.0f} cm"
                    if avg_d > 0 else f"<b>{name}</b><br>Tidak ada laporan",
                    max_width=250,
                ),
            )
            gj.add_to(m)

    # Report markers
    for r in rows:
        lat, lng = r.get("latitude"), r.get("longitude")
        if not lat or not lng:
            continue
        verified = r.get("verified") == 1 or r.get("verified") == "1"
        depth = r.get("water_depth", 0)
        loc = r.get("location_name", "Tidak diketahui")
        time_str = r.get("created_at", "")
        desc = r.get("description", "")
        icon_color = "#1e90ff" if verified else "#95a5a6"

        popup_html = f"""
        <div style="font-family:sans-serif;font-size:13px;min-width:180px">
            <b style="color:#0d6efd">{loc}</b><br>
            <small>{time_str}</small><br>
            <span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:8px;
                background:{depth_color(depth)};color:white if depth>50 else #003366">
                💧 {depth} cm — {depth_label(depth)}
            </span><br>
            <span style="color:{'green' if verified else 'orange'}">{'✅ Terverifikasi' if verified else '⏳ Menunggu'}</span>
            {f'<p style="margin-top:4px;font-size:12px">{desc}</p>' if desc else ''}
        </div>
        """

        folium.CircleMarker(
            location=[lat, lng],
            radius=8 + depth * 0.15,
            color=icon_color,
            fill=True,
            fillOpacity=0.8,
            popup=folium.Popup(popup_html, max_width=250),
            tooltip=f"{loc} — {depth} cm",
        ).add_to(m)

    st_folium(m, width=None, height=550)

    if rows:
        st.divider()
        st.subheader("Data Laporan di Peta")
        df = pd.DataFrame(rows)
        df["status"] = df["verified"].apply(lambda v: "Terverifikasi" if v == 1 or v == "1" else "Menunggu")
        df["kedalaman"] = df["water_depth"].apply(lambda d: f"{d} cm — {depth_label(d)}")
        st.dataframe(
            df[["location_name", "kedalaman", "status", "created_at"]].rename(
                columns={"location_name": "Lokasi", "created_at": "Waktu"}
            ),
            use_container_width=True,
            hide_index=True,
        )

# ---------- Laporan ----------
elif page == "Laporan":
    st.title("📋 Laporan Banjir")

    reports = api_get("/api/reports?limit=500")
    rows = reports if isinstance(reports, list) else reports.get("rows", []) if reports else []

    if not rows:
        st.info("Belum ada laporan.")
        st.stop()

    df = pd.DataFrame(rows)
    df["status"] = df["verified"].apply(lambda v: "Terverifikasi" if v == 1 or v == "1" else "Menunggu")
    df["kedalaman"] = df["water_depth"]
    df["waktu"] = pd.to_datetime(df["created_at"]).dt.strftime("%d %b %Y %H:%M")

    col1, col2 = st.columns([1, 3])
    with col1:
        filter_status = st.selectbox("Filter Status", ["Semua", "Terverifikasi", "Menunggu"])
    with col2:
        search = st.text_input("🔍 Cari lokasi", placeholder="Ketik nama lokasi...")

    filtered = df.copy()
    if filter_status == "Terverifikasi":
        filtered = filtered[filtered["verified"] == 1]
    elif filter_status == "Menunggu":
        filtered = filtered[filtered["verified"] != 1]
    if search:
        filtered = filtered[filtered["location_name"].str.contains(search, case=False, na=False)]

    st.write(f"Menampilkan {len(filtered)} dari {len(df)} laporan")

    for _, r in filtered.iterrows():
        with st.container(border=True):
            cols = st.columns([1, 4])
            with cols[0]:
                st.markdown(
                    f"<div style='background:{depth_color(r['water_depth'])};"
                    f"width:50px;height:50px;border-radius:8px;display:flex;"
                    f"flex-direction:column;align-items:center;justify-content:center;"
                    f"font-weight:bold;font-size:18px;color:#003366'>{r['water_depth'] or '?'} cm</div>",
                    unsafe_allow_html=True,
                )
            with cols[1]:
                st.markdown(f"**{r['location_name'] or 'Tidak diketahui'}**")
                st.caption(f"{r['waktu']} — {r['status']}")
                if r.get("description"):
                    st.markdown(f"_{r['description']}_")

    total_pages = max(1, (len(filtered) + 19) // 20)
    if total_pages > 1:
        st.markdown(f"*Halaman 1 dari {total_pages}*")

# ---------- Cuaca ----------
elif page == "Cuaca":
    st.title("🌤️ Informasi Cuaca BMKG")
    st.caption("Sumber: BMKG — Stasiun Meteorologi Bulukumba")

    weather = api_get("/api/reports/stats")
    if not weather:
        st.warning("Gagal memuat data cuaca.")

    # Fallback: fetch directly from BMKG API
    try:
        bmkg_resp = requests.get(
            "https://bmkg-restapi.vercel.app/v1/weather/73.02.02.1003/current",
            timeout=10,
        )
        if bmkg_resp.ok:
            w = bmkg_resp.json().get("data", {})
            if w:
                weather_map = {
                    0: "Cerah", 1: "Cerah Berawan", 2: "Berawan", 3: "Berawan Tebal",
                    60: "Hujan Ringan", 61: "Hujan Sedang", 63: "Hujan Lebat",
                    80: "Hujan Lokal", 95: "Hujan Petir", 97: "Hujan Petir Lebat",
                }
                code = w.get("weather_code", 0)
                label = weather_map.get(code, "Tidak diketahui")
                is_rainy = code in [60, 61, 63, 80, 95, 97]

                st.markdown(
                    f"<div style='padding:20px;border-radius:12px;"
                    f"background:{'#dc3545' if is_rainy else '#0d6efd'};"
                    f"color:white;text-align:center'>"
                    f"<h2 style='margin:0;font-size:48px'>{'🌧️' if is_rainy else '☀️'}</h2>"
                    f"<h3 style='margin:8px 0'>{label}</h3>"
                    f"<p style='font-size:24px;margin:0'>{w.get('temperature_c', '?')}°C</p>"
                    f"</div>",
                    unsafe_allow_html=True,
                )

                col1, col2, col3 = st.columns(3)
                col1.metric("Kelembaban", f"{w.get('humidity_pct', '?')}%")
                col2.metric("Kecepatan Angin", f"{w.get('wind_speed_kmh', '?')} km/h")
                col3.metric("Tekanan Udara", f"{w.get('pressure_mb', '?')} mb")

                st.divider()
                st.subheader("Prakiraan Cuaca")
                try:
                    fc_resp = requests.get(
                        "https://bmkg-restapi.vercel.app/v1/weather/73.02.02.1003",
                        timeout=10,
                    )
                    if fc_resp.ok:
                        fc_data = fc_resp.json().get("data", [])
                        if fc_data:
                            fc_df = pd.DataFrame(fc_data)
                            if "datetime" in fc_df.columns:
                                fc_df["datetime"] = pd.to_datetime(fc_df["datetime"])
                                st.dataframe(
                                    fc_df[["datetime", "weather_code", "temperature_c"]].rename(
                                        columns={
                                            "datetime": "Waktu",
                                            "weather_code": "Cuaca",
                                            "temperature_c": "Suhu (°C)",
                                        }
                                    ),
                                    use_container_width=True,
                                    hide_index=True,
                                )
                except:
                    pass
    except:
        st.error("Gagal memuat data cuaca dari BMKG.")

st.sidebar.divider()
st.sidebar.caption(f"Backend: {API_BASE}")
st.sidebar.caption("© 2026 Siaga Bulukumba")
